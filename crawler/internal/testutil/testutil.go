// Package testutil helps tests find the repository root, the shared data and
// the golden case files in shared/testcases.
package testutil

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
)

var (
	loadOnce sync.Once
	loaded   *shareddata.Data
	loadErr  error
	rootDir  string
)

// Root returns the repository root.
func Root(t testing.TB) string {
	t.Helper()
	root, err := shareddata.FindRoot(".")
	if err != nil {
		t.Fatal(err)
	}
	return root
}

// Data returns the shared data files, loaded once per test binary.
func Data(t testing.TB) *shareddata.Data {
	t.Helper()
	loadOnce.Do(func() {
		rootDir, loadErr = shareddata.FindRoot(".")
		if loadErr == nil {
			loaded, loadErr = shareddata.Load(rootDir)
		}
	})
	if loadErr != nil {
		t.Fatal(loadErr)
	}
	return loaded
}

// GoldenCases decodes the `cases` array of shared/testcases/<name>.
func GoldenCases[T any](t testing.TB, name string) []T {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(Root(t), "shared", "testcases", name))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Cases []T `json:"cases"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if len(file.Cases) == 0 {
		t.Fatalf("%s has no cases", name)
	}
	return file.Cases
}

// ReadFile reads a file relative to the repository root.
func ReadFile(t testing.TB, rel string) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(Root(t), filepath.FromSlash(rel)))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
