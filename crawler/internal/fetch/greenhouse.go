package fetch

import (
	"context"
	"html"
	"net/url"
	"strconv"
	"strings"
)

// Greenhouse reads boards-api.greenhouse.io (verified 2026-11-02).
type Greenhouse struct {
	Client  Getter
	BaseURL string // default https://boards-api.greenhouse.io
}

func (g *Greenhouse) Platform() string { return "greenhouse" }

type greenhouseResponse struct {
	Jobs []struct {
		ID             int64  `json:"id"`
		Title          string `json:"title"`
		AbsoluteURL    string `json:"absolute_url"`
		UpdatedAt      string `json:"updated_at"`
		FirstPublished string `json:"first_published"`
		Content        string `json:"content"`
		Location       struct {
			Name string `json:"name"`
		} `json:"location"`
		Departments []struct {
			Name string `json:"name"`
		} `json:"departments"`
	} `json:"jobs"`
}

// GreenhouseApplyURL is the embedded application form. Hosted job pages redirect
// to the company's own careers site when it has one; the embed form never does.
func GreenhouseApplyURL(token, jobID string) string {
	return "https://job-boards.greenhouse.io/embed/job_app?for=" + url.QueryEscape(token) + "&token=" + url.QueryEscape(jobID)
}

func (g *Greenhouse) Fetch(ctx context.Context, c Company) ([]RawJob, error) {
	base := g.BaseURL
	if base == "" {
		base = "https://boards-api.greenhouse.io"
	}
	var resp greenhouseResponse
	endpoint := base + "/v1/boards/" + url.PathEscape(c.Token) + "/jobs?content=true"
	if err := g.Client.GetJSON(ctx, endpoint, &resp); err != nil {
		return nil, err
	}
	jobs := make([]RawJob, 0, len(resp.Jobs))
	for _, j := range resp.Jobs {
		id := strconv.FormatInt(j.ID, 10)
		posted := parseTime(j.FirstPublished)
		if posted.IsZero() {
			posted = parseTime(j.UpdatedAt)
		}
		pageURL := j.AbsoluteURL
		if pageURL == "" {
			pageURL = "https://job-boards.greenhouse.io/" + url.PathEscape(c.Token) + "/jobs/" + id
		}
		raw := RawJob{
			ExternalID: id,
			Title:      j.Title,
			URL:        pageURL,
			ApplyURL:   GreenhouseApplyURL(c.Token, id),
			PostedAt:   posted,
			// The API entity-escapes the HTML; unescape once to get real HTML.
			DescriptionHTML: html.UnescapeString(j.Content),
		}
		if name := strings.TrimSpace(j.Location.Name); name != "" {
			raw.Locations = []string{name}
		}
		if len(j.Departments) > 0 {
			raw.Department = strings.TrimSpace(j.Departments[0].Name)
		}
		jobs = append(jobs, raw)
	}
	return jobs, nil
}
