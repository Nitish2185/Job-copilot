package feed

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	// RetentionDays of daily shards and closed files to keep (spec 7.8).
	RetentionDays = 30
	// SnapshotWarnBytes triggers a warning when snapshot.json grows past 15 MB.
	SnapshotWarnBytes = 15 << 20
)

// WriteInput is everything one run publishes.
type WriteInput struct {
	Dir           string // data/feed
	Now           time.Time
	Open          []Job    // every open job
	New           []Job    // first seen this run
	Closed        []string // closed this run
	Companies     []CompanyStatus
	SkillsVersion string
}

// WriteResult reports what was written.
type WriteResult struct {
	Index         Index
	SnapshotBytes int
	Warnings      []string
}

// Write publishes the feed. index.json is written last so a reader never sees
// an index that points at files not yet written.
func Write(in WriteInput) (WriteResult, error) {
	var res WriteResult
	now := in.Now.UTC()
	today := now.Format(DateLayout)
	generated := now.Format(TimeLayout)
	for _, sub := range []string{"", "jobs", "closed"} {
		if err := os.MkdirAll(filepath.Join(in.Dir, sub), 0o755); err != nil {
			return res, err
		}
	}

	open := nonNilJobs(in.Open)
	snapshot, err := compactJSON(Snapshot{SchemaVersion: SchemaVersion, GeneratedAt: generated, Jobs: open})
	if err != nil {
		return res, err
	}
	if err := os.WriteFile(filepath.Join(in.Dir, "snapshot.json"), snapshot, 0o644); err != nil {
		return res, err
	}
	res.SnapshotBytes = len(snapshot)
	if len(snapshot) > SnapshotWarnBytes {
		res.Warnings = append(res.Warnings, fmt.Sprintf("snapshot.json is %d MB (over 15 MB)", len(snapshot)>>20))
	}

	if err := mergeShard(filepath.Join(in.Dir, "jobs", today+".json"), today, in.New); err != nil {
		return res, err
	}
	if err := mergeClosed(filepath.Join(in.Dir, "closed", today+".json"), today, in.Closed); err != nil {
		return res, err
	}

	cutoff := now.AddDate(0, 0, -(RetentionDays - 1)).Format(DateLayout)
	shards, err := listDaily(filepath.Join(in.Dir, "jobs"), cutoff)
	if err != nil {
		return res, err
	}
	closed, err := listDaily(filepath.Join(in.Dir, "closed"), cutoff)
	if err != nil {
		return res, err
	}

	companies := append([]CompanyStatus(nil), in.Companies...)
	sort.Slice(companies, func(i, j int) bool {
		if companies[i].Platform != companies[j].Platform {
			return companies[i].Platform < companies[j].Platform
		}
		return companies[i].Token < companies[j].Token
	})
	if companies == nil {
		companies = []CompanyStatus{}
	}
	if err := writeIndented(filepath.Join(in.Dir, "companies.json"), Companies{GeneratedAt: generated, Companies: companies}); err != nil {
		return res, err
	}

	index := Index{
		SchemaVersion: SchemaVersion,
		GeneratedAt:   generated,
		TotalOpenJobs: len(open),
		CompanyCount:  len(companies),
		SkillsVersion: in.SkillsVersion,
		Snapshot:      FileRef{File: "snapshot.json", SHA256: sha(snapshot), Count: len(open)},
		Shards:        []ShardRef{},
		ClosedShards:  []ClosedRef{},
	}
	for _, d := range shards {
		var s Shard
		raw, err := readJSON(filepath.Join(in.Dir, "jobs", d+".json"), &s)
		if err != nil {
			return res, err
		}
		index.Shards = append(index.Shards, ShardRef{Date: d, File: "jobs/" + d + ".json", Count: len(s.Jobs), SHA256: sha(raw)})
	}
	for _, d := range closed {
		var c ClosedShard
		if _, err := readJSON(filepath.Join(in.Dir, "closed", d+".json"), &c); err != nil {
			return res, err
		}
		index.ClosedShards = append(index.ClosedShards, ClosedRef{Date: d, File: "closed/" + d + ".json", Count: len(c.IDs)})
	}
	if err := writeIndented(filepath.Join(in.Dir, "index.json"), index); err != nil {
		return res, err
	}
	res.Index = index
	return res, nil
}

// mergeShard adds this run's new jobs to today's shard (runs on the same UTC
// day share one file). Newer data for the same ID wins.
func mergeShard(path, date string, jobs []Job) error {
	byID := map[string]Job{}
	var existing Shard
	if _, err := readJSON(path, &existing); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, j := range existing.Jobs {
		byID[j.ID] = j
	}
	for _, j := range jobs {
		byID[j.ID] = j
	}
	if len(byID) == 0 {
		return nil
	}
	merged := make([]Job, 0, len(byID))
	for _, j := range byID {
		merged = append(merged, j)
	}
	sort.Slice(merged, func(i, k int) bool { return merged[i].ID < merged[k].ID })
	raw, err := compactJSON(Shard{Date: date, Jobs: nonNilJobs(merged)})
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

func mergeClosed(path, date string, ids []string) error {
	set := map[string]bool{}
	var existing ClosedShard
	if _, err := readJSON(path, &existing); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, id := range existing.IDs {
		set[id] = true
	}
	for _, id := range ids {
		set[id] = true
	}
	if len(set) == 0 {
		return nil
	}
	merged := make([]string, 0, len(set))
	for id := range set {
		merged = append(merged, id)
	}
	sort.Strings(merged)
	raw, err := compactJSON(ClosedShard{Date: date, IDs: merged})
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

// listDaily returns the dates of YYYY-MM-DD.json files kept in dir, sorted, and
// deletes files older than cutoff.
func listDaily(dir, cutoff string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var dates []string
	for _, e := range entries {
		name := e.Name()
		date, ok := strings.CutSuffix(name, ".json")
		if e.IsDir() || !ok {
			continue
		}
		if _, err := time.Parse(DateLayout, date); err != nil {
			continue
		}
		if date < cutoff {
			if err := os.Remove(filepath.Join(dir, name)); err != nil {
				return nil, err
			}
			continue
		}
		dates = append(dates, date)
	}
	sort.Strings(dates)
	return dates, nil
}

// compactJSON encodes without whitespace or HTML escaping.
func compactJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func writeIndented(path string, v any) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(v); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func readJSON(path string, v any) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return raw, json.Unmarshal(raw, v)
}

func sha(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// nonNilJobs makes sure every slice field encodes as [] rather than null.
func nonNilJobs(jobs []Job) []Job {
	out := make([]Job, len(jobs))
	for i, j := range jobs {
		if j.Locations == nil {
			j.Locations = []string{}
		}
		if j.CountryCodes == nil {
			j.CountryCodes = []string{}
		}
		if j.Skills == nil {
			j.Skills = []string{}
		}
		out[i] = j
	}
	return out
}
