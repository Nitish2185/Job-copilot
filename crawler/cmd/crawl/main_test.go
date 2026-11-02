package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

func runCmd(args ...string) (int, string, string) {
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), args, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

func TestUsage(t *testing.T) {
	if code, _, errOut := runCmd(); code != 2 || !strings.Contains(errOut, "Usage: crawl") {
		t.Errorf("no command: %d %q", code, errOut)
	}
	if code, out, _ := runCmd("help"); code != 0 || !strings.Contains(out, "validate-companies") {
		t.Errorf("help: %d %q", code, out)
	}
	if code, _, errOut := runCmd("nope"); code != 2 || !strings.Contains(errOut, `unknown command "nope"`) {
		t.Errorf("unknown: %d %q", code, errOut)
	}
}

func TestDiscoverFromURLWithoutNetwork(t *testing.T) {
	code, out, errOut := runCmd("discover", "--no-check", "--name", "Acme", "https://jobs.eu.lever.co/acme/3f2b6c1e-8a7d-4e5f-9b0c-1d2e3f4a5b6c")
	want := `{"name":"Acme","platform":"lever","token":"acme","variant":"eu","region":[]}`
	if code != 0 || strings.TrimSpace(out) != want {
		t.Errorf("code %d out %q err %q", code, out, errOut)
	}
}

func TestDiscoverUnsupported(t *testing.T) {
	if code, _, errOut := runCmd("discover", "--no-check", "https://www.naukri.com/job-listings-x"); code != 1 || !strings.Contains(errOut, "no supported job board") {
		t.Errorf("code %d err %q", code, errOut)
	}
}

func TestStatsOnGoldenFeed(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "feed"), 0o755); err != nil {
		t.Fatal(err)
	}
	snapshot := testutil.ReadFile(t, "crawler/testdata/golden/feed/snapshot.json")
	if err := os.WriteFile(filepath.Join(dir, "feed", "snapshot.json"), snapshot, 0o644); err != nil {
		t.Fatal(err)
	}
	code, out, errOut := runCmd("stats", "--data", dir)
	if code != 0 || !strings.Contains(out, "Open jobs: 12") || !strings.Contains(out, "Platform") || !strings.Contains(out, "Skill") {
		t.Errorf("code %d out %q err %q", code, out, errOut)
	}
}
