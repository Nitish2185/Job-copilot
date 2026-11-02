package feed

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func testJob(id string) Job {
	return Job{ID: "lever:acme:" + id, Platform: "lever", Company: Company{Name: "Acme", Token: "acme"}, Title: "Engineer <Go> & Rust",
		URL: "https://jobs.lever.co/acme/" + id, ApplyURL: "https://jobs.lever.co/acme/" + id + "/apply", Remote: "remote",
		FirstSeenAt: "2026-11-02T06:00:00Z", Snippet: "s", DescHash: strings.Repeat("a", 64)}
}

func read(t *testing.T, path string, v any) []byte {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, v); err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestWriteProducesAllFiles(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 11, 2, 6, 0, 0, 0, time.UTC)
	res, err := Write(WriteInput{
		Dir: dir, Now: now, SkillsVersion: "2026-11-02",
		Open:      []Job{testJob("1"), testJob("2")},
		New:       []Job{testJob("2")},
		Closed:    []string{"lever:acme:0"},
		Companies: []CompanyStatus{{Name: "Acme", Platform: "lever", Token: "acme", JobCount: 2, LastStatus: "ok"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	var snap Snapshot
	raw := read(t, filepath.Join(dir, "snapshot.json"), &snap)
	if len(snap.Jobs) != 2 || snap.SchemaVersion != 1 || strings.ContainsAny(string(raw), "\n") || strings.Contains(string(raw), `": `) {
		t.Errorf("snapshot not compact or wrong: %s", raw[:80])
	}
	if !strings.Contains(string(raw), "Engineer <Go> & Rust") {
		t.Error("snapshot should not HTML-escape <, > and &")
	}
	sum := sha256.Sum256(raw)
	if res.Index.Snapshot.SHA256 != hex.EncodeToString(sum[:]) || res.Index.Snapshot.Count != 2 {
		t.Errorf("index snapshot ref %+v", res.Index.Snapshot)
	}

	var shard Shard
	read(t, filepath.Join(dir, "jobs", "2026-11-02.json"), &shard)
	var closed ClosedShard
	read(t, filepath.Join(dir, "closed", "2026-11-02.json"), &closed)
	if len(shard.Jobs) != 1 || !reflect.DeepEqual(closed.IDs, []string{"lever:acme:0"}) {
		t.Errorf("shard %+v closed %+v", shard, closed)
	}

	var index Index
	read(t, filepath.Join(dir, "index.json"), &index)
	if index.TotalOpenJobs != 2 || index.CompanyCount != 1 || len(index.Shards) != 1 || len(index.ClosedShards) != 1 {
		t.Errorf("index %+v", index)
	}
	if index.Shards[0].File != "jobs/2026-11-02.json" || index.Shards[0].Count != 1 {
		t.Errorf("shard ref %+v", index.Shards[0])
	}
}

func TestRunsOnTheSameDayMergeShards(t *testing.T) {
	dir := t.TempDir()
	morning := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	for i, now := range []time.Time{morning, morning.Add(6 * time.Hour)} {
		_, err := Write(WriteInput{Dir: dir, Now: now, SkillsVersion: "v",
			New: []Job{testJob(string(rune('1' + i)))}, Closed: []string{"x" + string(rune('1'+i))}})
		if err != nil {
			t.Fatal(err)
		}
	}
	var shard Shard
	read(t, filepath.Join(dir, "jobs", "2026-11-02.json"), &shard)
	var closed ClosedShard
	read(t, filepath.Join(dir, "closed", "2026-11-02.json"), &closed)
	if len(shard.Jobs) != 2 || len(closed.IDs) != 2 {
		t.Errorf("shard %d jobs, closed %v", len(shard.Jobs), closed.IDs)
	}
}

func TestOldShardsAreDeletedAndUnlisted(t *testing.T) {
	dir := t.TempDir()
	start := time.Date(2026, 10, 1, 6, 0, 0, 0, time.UTC)
	var res WriteResult
	var err error
	for d := 0; d < 35; d++ {
		res, err = Write(WriteInput{Dir: dir, Now: start.AddDate(0, 0, d), SkillsVersion: "v", New: []Job{testJob("x")}})
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(res.Index.Shards) != RetentionDays {
		t.Fatalf("index lists %d shards, want %d", len(res.Index.Shards), RetentionDays)
	}
	files, _ := os.ReadDir(filepath.Join(dir, "jobs"))
	if len(files) != RetentionDays {
		t.Fatalf("%d shard files on disk", len(files))
	}
	if res.Index.Shards[0].Date != "2026-10-06" {
		t.Errorf("oldest kept shard %s", res.Index.Shards[0].Date)
	}
}

func TestEmptyRunWritesEmptyArraysNotNull(t *testing.T) {
	dir := t.TempDir()
	if _, err := Write(WriteInput{Dir: dir, Now: time.Now(), SkillsVersion: "v"}); err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"snapshot.json", "index.json", "companies.json"} {
		raw, _ := os.ReadFile(filepath.Join(dir, f))
		if strings.Contains(string(raw), "null") {
			t.Errorf("%s contains null: %s", f, raw)
		}
	}
}
