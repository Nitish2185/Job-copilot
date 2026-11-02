// Command crawl builds the shared job feed from public job-board APIs.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/crawl"
	"github.com/Nitish2185/Job-copilot/crawler/internal/fetch"
	"github.com/Nitish2185/Job-copilot/crawler/internal/platforms"
	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
)

const usageText = `Usage: crawl <command> [flags]

Commands:
  crawl                      Fetch all companies and write the feed
  validate-companies [--fix] Check every entry in companies.json
  discover <careers-url>     Detect platform and token for a careers page
  stats                      Print feed counts per platform, country and skill

Run "crawl <command> -h" for a command's flags.
`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(stderr, usageText)
		return 2
	}
	var err error
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprint(stdout, usageText)
		return 0
	case "crawl":
		return runCrawl(ctx, args[1:], stdout, stderr)
	case "validate-companies":
		err = runValidate(ctx, args[1:], stdout, stderr)
	case "discover":
		err = runDiscover(ctx, args[1:], stdout, stderr)
	case "stats":
		err = runStats(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", args[0], usageText)
		return 2
	}
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		fmt.Fprintln(stderr, "error:", err)
		return 1
	}
	return 0
}

func newFlags(name string, stderr io.Writer) (*flag.FlagSet, *string) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.SetOutput(stderr)
	root := fs.String("root", "", "repository root (default: found by walking up from the current folder)")
	return fs, root
}

func resolveRoot(root string) (string, error) {
	if root != "" {
		return root, nil
	}
	return shareddata.FindRoot(".")
}

func newLogger(stderr io.Writer, verbose bool) *slog.Logger {
	level := slog.LevelInfo
	if verbose {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewTextHandler(stderr, &slog.HandlerOptions{Level: level}))
}

func runCrawl(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	fs, rootFlag := newFlags("crawl", stderr)
	dataDir := fs.String("data", "", "output folder (default <root>/data)")
	companiesPath := fs.String("companies", "", "companies file (default <root>/crawler/companies.json)")
	detailCap := fs.Int("detail-cap", fetch.DefaultDetailCap, "SmartRecruiters description fetches per company per run")
	verbose := fs.Bool("v", false, "debug logging")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	root, err := resolveRoot(*rootFlag)
	if err != nil {
		fmt.Fprintln(stderr, "error:", err)
		return 1
	}
	log := newLogger(stderr, *verbose)
	started := time.Now()
	sum, err := crawl.Run(ctx, crawl.Config{
		Root: root, DataDir: *dataDir, CompaniesPath: *companiesPath, Logger: log, DetailCap: *detailCap,
	})
	if err != nil {
		fmt.Fprintln(stderr, "error:", err)
		return 1
	}
	report := summaryMarkdown(sum, time.Since(started))
	fmt.Fprint(stdout, report)
	if path := os.Getenv("GITHUB_STEP_SUMMARY"); path != "" {
		if f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644); err == nil {
			_, _ = f.WriteString(report)
			_ = f.Close()
		}
	}
	// A few broken entries must never break the scheduled workflow (spec 7.6).
	if sum.FailedShare() > 0.5 {
		fmt.Fprintf(stderr, "error: %d of %d companies failed\n", sum.Failed, sum.Companies)
		return 1
	}
	return 0
}

func summaryMarkdown(s crawl.Summary, took time.Duration) string {
	var b strings.Builder
	fmt.Fprintf(&b, "## Crawl summary\n\n")
	fmt.Fprintf(&b, "| | |\n|---|---|\n")
	fmt.Fprintf(&b, "| Companies | %d (%d ok, %d failed) |\n", s.Companies, s.Succeeded, s.Failed)
	fmt.Fprintf(&b, "| Open jobs | %d |\n", s.OpenJobs)
	fmt.Fprintf(&b, "| New jobs | %d |\n", s.NewJobs)
	fmt.Fprintf(&b, "| Closed jobs | %d |\n", s.ClosedJobs)
	fmt.Fprintf(&b, "| Changed descriptions | %d |\n", s.ChangedJobs)
	fmt.Fprintf(&b, "| Skipped jobs | %d |\n", s.SkippedJobs)
	fmt.Fprintf(&b, "| Snapshot size | %.1f MB |\n", float64(s.SnapshotBytes)/(1<<20))
	fmt.Fprintf(&b, "| Took | %s |\n\n", took.Round(time.Second))
	if len(s.NotFound) > 0 {
		fmt.Fprintf(&b, "**Not found (moved or closed, run validate-companies --fix):** %s\n\n", strings.Join(s.NotFound, ", "))
	}
	if len(s.Errors) > 0 {
		fmt.Fprintf(&b, "**Failed (kept previous jobs):** %s\n\n", strings.Join(s.Errors, ", "))
	}
	for _, w := range s.Warnings {
		fmt.Fprintf(&b, "**Warning:** %s\n\n", w)
	}
	return b.String()
}

func runValidate(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	fs, rootFlag := newFlags("validate-companies", stderr)
	companiesPath := fs.String("companies", "", "companies file (default <root>/crawler/companies.json)")
	fix := fs.Bool("fix", false, "remove entries that are gone (404) or list no jobs")
	if err := fs.Parse(args); err != nil {
		return err
	}
	root, err := resolveRoot(*rootFlag)
	if err != nil {
		return err
	}
	path := *companiesPath
	if path == "" {
		path = filepath.Join(root, "crawler", "companies.json")
	}
	companies, err := crawl.LoadCompanies(path)
	if err != nil {
		return err
	}
	results := crawl.Validate(ctx, companies, crawl.ValidationFetchers(crawl.NewClient(newLogger(stderr, false))), 8)

	tw := tabwriter.NewWriter(stdout, 0, 2, 2, ' ', 0)
	fmt.Fprintln(tw, "STATUS\tJOBS\tPLATFORM\tTOKEN\tNAME")
	counts := map[string]int{}
	var kept []fetch.Company
	for _, r := range results {
		counts[r.Status]++
		fmt.Fprintf(tw, "%s\t%d\t%s\t%s\t%s\n", r.Status, r.Jobs, r.Company.Platform, r.Company.Token, r.Company.Name)
		if !r.Dead() {
			kept = append(kept, r.Company)
		}
	}
	_ = tw.Flush()
	fmt.Fprintf(stdout, "\n%d companies: %d ok, %d empty, %d not found, %d errors\n",
		len(results), counts["ok"], counts["empty"], counts["not_found"], counts["error"])
	if *fix && len(kept) != len(companies) {
		if err := crawl.WriteCompanies(path, kept); err != nil {
			return err
		}
		fmt.Fprintf(stdout, "Removed %d dead entries from %s\n", len(companies)-len(kept), path)
	}
	return nil
}

var titlePattern = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

func runDiscover(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	fs := flag.NewFlagSet("discover", flag.ContinueOnError)
	fs.SetOutput(stderr)
	name := fs.String("name", "", "company name for the entry (default: from the page title or token)")
	noCheck := fs.Bool("no-check", false, "do not download the page or count jobs")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		return errors.New("usage: crawl discover [--name NAME] <careers-url>")
	}
	pageURL := fs.Arg(0)
	client := crawl.NewClient(newLogger(stderr, false))

	match := platforms.FromURL(pageURL)
	pageTitle := ""
	if (match == nil || match.Token == nil) && !*noCheck {
		body, err := client.Get(ctx, pageURL)
		if err != nil {
			return fmt.Errorf("could not download %s: %w", pageURL, err)
		}
		html := string(body)
		match = platforms.Detect(pageURL, &html)
		if m := titlePattern.FindStringSubmatch(html); m != nil {
			pageTitle = strings.TrimSpace(m[1])
		}
	}
	if match == nil || match.Token == nil {
		return errors.New("no supported job board found (Greenhouse, Lever, Ashby, SmartRecruiters or Workable)")
	}
	entry := fetch.Company{Name: *name, Platform: match.Platform, Token: *match.Token, Variant: match.Variant, Region: []string{}}
	if entry.Name == "" {
		entry.Name = firstNonEmpty(pageTitle, entry.Token)
	}
	line, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	fmt.Fprintf(stdout, "%s\n", line)
	if !*noCheck {
		v := crawl.Validate(ctx, []fetch.Company{entry}, crawl.ValidationFetchers(client), 1)[0]
		fmt.Fprintf(stderr, "check: %s, %d jobs. Fill in \"region\" (ISO-2 codes and/or \"REMOTE\") before adding it.\n", v.Status, v.Jobs)
	}
	return nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func runStats(args []string, stdout, stderr io.Writer) error {
	fs, rootFlag := newFlags("stats", stderr)
	dataDir := fs.String("data", "", "feed data folder (default <root>/data)")
	top := fs.Int("top", 20, "rows per table")
	if err := fs.Parse(args); err != nil {
		return err
	}
	dir := *dataDir
	if dir == "" {
		root, err := resolveRoot(*rootFlag)
		if err != nil {
			return err
		}
		dir = filepath.Join(root, "data")
	}
	jobs, err := crawl.LoadSnapshot(filepath.Join(dir, "feed", "snapshot.json"))
	if err != nil {
		return err
	}
	if jobs == nil {
		return errors.New("no snapshot.json yet: run `crawl crawl` first")
	}
	platformCounts, countryCounts, skillCounts, remoteCounts := map[string]int{}, map[string]int{}, map[string]int{}, map[string]int{}
	for _, j := range jobs {
		platformCounts[j.Platform]++
		remoteCounts[j.Remote]++
		if len(j.CountryCodes) == 0 {
			countryCounts["(none)"]++
		}
		for _, c := range j.CountryCodes {
			countryCounts[c]++
		}
		for _, s := range j.Skills {
			skillCounts[s]++
		}
	}
	fmt.Fprintf(stdout, "Open jobs: %d\n", len(jobs))
	printTable(stdout, "Platform", platformCounts, 0)
	printTable(stdout, "Remote", remoteCounts, 0)
	printTable(stdout, "Country", countryCounts, *top)
	printTable(stdout, "Skill", skillCounts, *top)
	return nil
}

func printTable(w io.Writer, title string, counts map[string]int, limit int) {
	type row struct {
		key string
		n   int
	}
	rows := make([]row, 0, len(counts))
	for k, n := range counts {
		rows = append(rows, row{k, n})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].n != rows[j].n {
			return rows[i].n > rows[j].n
		}
		return rows[i].key < rows[j].key
	})
	if limit > 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	fmt.Fprintf(w, "\n%s\n", title)
	tw := tabwriter.NewWriter(w, 0, 2, 2, ' ', 0)
	for _, r := range rows {
		fmt.Fprintf(tw, "  %s\t%d\n", r.key, r.n)
	}
	_ = tw.Flush()
}
