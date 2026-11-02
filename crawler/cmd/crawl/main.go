// Command crawl builds the shared job feed from public job-board APIs.
package main

import (
	"fmt"
	"io"
	"os"
)

const usageText = `Usage: crawl <command> [flags]

Commands:
  crawl                     Fetch all companies and write the feed
  validate-companies [--fix] Check every entry in companies.json
  discover <careers-url>    Detect platform and token for a careers page
  stats                     Print feed counts per platform, country and skill
`

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(stderr, usageText)
		return 2
	}

	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprint(stdout, usageText)
		return 0
	case "crawl", "validate-companies", "discover", "stats":
		fmt.Fprintf(stderr, "%s: not implemented yet\n", args[0])
		return 1
	default:
		fmt.Fprintf(stderr, "unknown command %q\n\n%s", args[0], usageText)
		return 2
	}
}
