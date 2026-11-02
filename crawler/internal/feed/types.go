// Package feed mirrors the feed contract in shared/src/schemas/feed.ts (spec 8)
// and writes the feed files. JSON tags must match the Zod schemas exactly; a
// TypeScript test parses testdata/golden with Zod to prove it.
package feed

// SchemaVersion of the feed files. Bump it (and FEED_SCHEMA_VERSION in
// shared/src/config.ts) on any contract change.
const SchemaVersion = 1

// TimeLayout is UTC ISO-8601 with a Z suffix, as the Zod schema requires.
const TimeLayout = "2006-01-02T15:04:05Z"

// DateLayout names daily shard files.
const DateLayout = "2006-01-02"

// Company is the job's company.
type Company struct {
	Name  string `json:"name"`
	Token string `json:"token"`
}

// Salary as published by the job board.
type Salary struct {
	Min      *float64 `json:"min,omitempty"`
	Max      *float64 `json:"max,omitempty"`
	Currency string   `json:"currency"`
	Period   string   `json:"period"`
}

// Job is one FeedJob.
type Job struct {
	ID             string   `json:"id"`
	Platform       string   `json:"platform"`
	Company        Company  `json:"company"`
	Title          string   `json:"title"`
	Locations      []string `json:"locations"`
	Remote         string   `json:"remote"`
	CountryCodes   []string `json:"countryCodes"`
	URL            string   `json:"url"`
	ApplyURL       string   `json:"applyUrl"`
	PostedAt       string   `json:"postedAt,omitempty"`
	FirstSeenAt    string   `json:"firstSeenAt"`
	Skills         []string `json:"skills"`
	ExpMin         *float64 `json:"expMin,omitempty"`
	ExpMax         *float64 `json:"expMax,omitempty"`
	Salary         *Salary  `json:"salary,omitempty"`
	EmploymentType string   `json:"employmentType,omitempty"`
	Department     string   `json:"department,omitempty"`
	Snippet        string   `json:"snippet"`
	DescHash       string   `json:"descHash"`
}

// CompanyKey is "platform:token".
func (j Job) CompanyKey() string { return j.Platform + ":" + j.Company.Token }

// Snapshot is snapshot.json.
type Snapshot struct {
	SchemaVersion int    `json:"schemaVersion"`
	GeneratedAt   string `json:"generatedAt"`
	Jobs          []Job  `json:"jobs"`
}

// Shard is jobs/YYYY-MM-DD.json.
type Shard struct {
	Date string `json:"date"`
	Jobs []Job  `json:"jobs"`
}

// ClosedShard is closed/YYYY-MM-DD.json.
type ClosedShard struct {
	Date string   `json:"date"`
	IDs  []string `json:"ids"`
}

// FileRef describes a file listed in index.json.
type FileRef struct {
	File   string `json:"file"`
	SHA256 string `json:"sha256"`
	Count  int    `json:"count"`
}

// ShardRef describes a daily shard listed in index.json.
type ShardRef struct {
	Date   string `json:"date"`
	File   string `json:"file"`
	Count  int    `json:"count"`
	SHA256 string `json:"sha256"`
}

// ClosedRef describes a closed file listed in index.json.
type ClosedRef struct {
	Date  string `json:"date"`
	File  string `json:"file"`
	Count int    `json:"count"`
}

// Index is index.json.
type Index struct {
	SchemaVersion int         `json:"schemaVersion"`
	GeneratedAt   string      `json:"generatedAt"`
	TotalOpenJobs int         `json:"totalOpenJobs"`
	CompanyCount  int         `json:"companyCount"`
	SkillsVersion string      `json:"skillsVersion"`
	Snapshot      FileRef     `json:"snapshot"`
	Shards        []ShardRef  `json:"shards"`
	ClosedShards  []ClosedRef `json:"closedShards"`
}

// CompanyStatus is one row of the public companies.json.
type CompanyStatus struct {
	Name       string `json:"name"`
	Platform   string `json:"platform"`
	Token      string `json:"token"`
	JobCount   int    `json:"jobCount"`
	LastOkAt   string `json:"lastOkAt,omitempty"`
	LastStatus string `json:"lastStatus"`
}

// Companies is the public companies.json.
type Companies struct {
	GeneratedAt string          `json:"generatedAt"`
	Companies   []CompanyStatus `json:"companies"`
}
