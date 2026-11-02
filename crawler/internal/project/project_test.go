package project

import (
	"strings"
	"testing"
)

func TestUserAgentNamesTheRepository(t *testing.T) {
	if !strings.HasPrefix(UserAgent, "JobCopilotCrawler/1.0 (+https://github.com/") {
		t.Fatalf("unexpected User-Agent %q", UserAgent)
	}
	if !strings.Contains(UserAgent, RepoURL) {
		t.Fatalf("User-Agent %q does not include %q", UserAgent, RepoURL)
	}
}
