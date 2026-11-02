// Package platforms is the Go port of shared/src/platforms/detect.ts. Both
// pass shared/testcases/platform-urls.cases.json.
package platforms

import (
	"net/url"
	"regexp"
	"strings"
)

// Match is a detected job board. Token is nil when only a job ID is known.
type Match struct {
	Platform string  `json:"platform"`
	Token    *string `json:"token"`
	JobID    string  `json:"jobId,omitempty"`
	Variant  string  `json:"variant,omitempty"`
}

var (
	tokenPattern             = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*$`)
	uuidPattern              = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	digitsPattern            = regexp.MustCompile(`^\d+$`)
	smartRecruitersIDPattern = regexp.MustCompile(`^(\d+)(?:-|$)`)
	workableShortcodePattern = regexp.MustCompile(`^[A-Za-z0-9]+$`)
	schemePattern            = regexp.MustCompile(`(?i)^[a-z][a-z0-9+.-]*://`)
	htmlLinkPattern          = regexp.MustCompile(`(?i)(?:https?:)?//[a-z0-9.-]+\.(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com)[^\t\n\f\r "'<>)\\]*`)

	reservedTokens             = map[string]bool{"embed": true, "v1": true, "api": true, "jobs": true, "j": true, "oneclick-ui": true}
	workableReservedSubdomains = map[string]bool{"apply": true, "www": true, "jobs": true, "careers": true}
)

func parseURL(raw string) *url.URL {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil
	}
	if strings.HasPrefix(s, "//") {
		s = "https:" + s
	} else if !schemePattern.MatchString(s) {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
		return nil
	}
	return u
}

func validToken(t string) bool {
	return t != "" && tokenPattern.MatchString(t) && !reservedTokens[strings.ToLower(t)]
}

func at(parts []string, i int) string {
	if i < len(parts) {
		return parts[i]
	}
	return ""
}

func str(s string) *string { return &s }

// FromURL detects the platform from a URL alone.
func FromURL(raw string) *Match {
	u := parseURL(raw)
	if u == nil {
		return nil
	}
	host := strings.ToLower(u.Hostname())
	var path []string
	for _, p := range strings.Split(u.Path, "/") {
		if p != "" {
			path = append(path, p)
		}
	}
	q := u.Query()

	switch {
	case host == "boards.greenhouse.io" || host == "job-boards.greenhouse.io":
		if at(path, 0) == "embed" {
			token := q.Get("for")
			if !validToken(token) {
				return nil
			}
			m := &Match{Platform: "greenhouse", Token: str(token)}
			if at(path, 1) == "job_app" && digitsPattern.MatchString(q.Get("token")) {
				m.JobID = q.Get("token")
			}
			return m
		}
		token := at(path, 0)
		if !validToken(token) {
			return nil
		}
		m := &Match{Platform: "greenhouse", Token: str(token)}
		if at(path, 1) == "jobs" && digitsPattern.MatchString(at(path, 2)) {
			m.JobID = at(path, 2)
		} else if digitsPattern.MatchString(q.Get("gh_jid")) {
			m.JobID = q.Get("gh_jid")
		}
		return m

	case host == "jobs.lever.co" || host == "jobs.eu.lever.co":
		token := at(path, 0)
		if !validToken(token) {
			return nil
		}
		m := &Match{Platform: "lever", Token: str(token)}
		if host == "jobs.eu.lever.co" {
			m.Variant = "eu"
		}
		if uuidPattern.MatchString(at(path, 1)) {
			m.JobID = at(path, 1)
		}
		return m

	case host == "jobs.ashbyhq.com":
		token := at(path, 0)
		if !validToken(token) {
			return nil
		}
		m := &Match{Platform: "ashby", Token: str(token)}
		if uuidPattern.MatchString(at(path, 1)) {
			m.JobID = at(path, 1)
		}
		return m

	case host == "jobs.smartrecruiters.com" || host == "careers.smartrecruiters.com":
		if at(path, 0) == "oneclick-ui" && at(path, 1) == "company" {
			if validToken(at(path, 2)) {
				return &Match{Platform: "smartrecruiters", Token: str(at(path, 2))}
			}
			return nil
		}
		token := at(path, 0)
		if !validToken(token) {
			return nil
		}
		m := &Match{Platform: "smartrecruiters", Token: str(token)}
		if sm := smartRecruitersIDPattern.FindStringSubmatch(at(path, 1)); sm != nil {
			m.JobID = sm[1]
		}
		return m

	case host == "apply.workable.com":
		if at(path, 0) == "j" {
			if code := at(path, 1); workableShortcodePattern.MatchString(code) {
				return &Match{Platform: "workable", Token: nil, JobID: code}
			}
			return nil
		}
		token := at(path, 0)
		if !validToken(token) {
			return nil
		}
		m := &Match{Platform: "workable", Token: str(token)}
		if at(path, 1) == "j" && workableShortcodePattern.MatchString(at(path, 2)) {
			m.JobID = at(path, 2)
		}
		return m

	case strings.HasSuffix(host, ".workable.com"):
		sub := strings.TrimSuffix(host, ".workable.com")
		if !strings.Contains(sub, ".") && !workableReservedSubdomains[sub] && validToken(sub) {
			return &Match{Platform: "workable", Token: str(sub)}
		}
		return nil
	}

	if jid := q.Get("gh_jid"); digitsPattern.MatchString(jid) {
		return &Match{Platform: "greenhouse", Token: nil, JobID: jid}
	}
	if jid := q.Get("ashby_jid"); uuidPattern.MatchString(jid) {
		return &Match{Platform: "ashby", Token: nil, JobID: jid}
	}
	return nil
}

// FromHTML finds the first ATS link with a company token in careers-page HTML.
func FromHTML(html string) *Match {
	for _, link := range htmlLinkPattern.FindAllString(html, -1) {
		if m := FromURL(strings.ReplaceAll(link, "&amp;", "&")); m != nil && m.Token != nil {
			return m
		}
	}
	return nil
}

// Detect tries the URL first, then embedded boards in the HTML (keeping the
// URL's job ID).
func Detect(rawURL string, html *string) *Match {
	fromURL := FromURL(rawURL)
	if fromURL != nil && fromURL.Token != nil {
		return fromURL
	}
	if html != nil {
		if fromHTML := FromHTML(*html); fromHTML != nil && (fromURL == nil || fromURL.Platform == fromHTML.Platform) {
			if fromURL != nil && fromURL.JobID != "" {
				fromHTML.JobID = fromURL.JobID
			}
			return fromHTML
		}
	}
	return fromURL
}
