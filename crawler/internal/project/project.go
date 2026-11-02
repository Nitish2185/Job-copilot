// Package project holds identifiers shared by every crawler command.
package project

// RepoURL is rewritten by `pnpm run set-owner <owner> <repo>`.
const RepoURL = "https://github.com/Nitish2185/Job-copilot"

// UserAgent identifies the crawler to job-board APIs (spec 7.6).
const UserAgent = "JobCopilotCrawler/1.0 (+" + RepoURL + ")"
