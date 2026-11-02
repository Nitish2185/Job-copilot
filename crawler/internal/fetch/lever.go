package fetch

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

// Lever reads api.lever.co and api.eu.lever.co (verified 2026-11-02).
type Lever struct {
	Client    Getter
	BaseURL   string // default https://api.lever.co
	EUBaseURL string // default https://api.eu.lever.co
}

func (l *Lever) Platform() string { return "lever" }

type leverPosting struct {
	ID               string `json:"id"`
	Text             string `json:"text"`
	HostedURL        string `json:"hostedUrl"`
	ApplyURL         string `json:"applyUrl"`
	CreatedAt        int64  `json:"createdAt"`
	DescriptionPlain string `json:"descriptionPlain"`
	Description      string `json:"description"`
	AdditionalPlain  string `json:"additionalPlain"`
	WorkplaceType    string `json:"workplaceType"`
	Country          string `json:"country"`
	Lists            []struct {
		Text    string `json:"text"`
		Content string `json:"content"`
	} `json:"lists"`
	Categories struct {
		Location     string   `json:"location"`
		Team         string   `json:"team"`
		Commitment   string   `json:"commitment"`
		AllLocations []string `json:"allLocations"`
	} `json:"categories"`
	SalaryRange *struct {
		Min      *float64 `json:"min"`
		Max      *float64 `json:"max"`
		Currency string   `json:"currency"`
		Interval string   `json:"interval"`
	} `json:"salaryRange"`
}

func (l *Lever) Fetch(ctx context.Context, c Company) ([]RawJob, error) {
	base := l.BaseURL
	if base == "" {
		base = "https://api.lever.co"
	}
	if c.Variant == "eu" {
		base = l.EUBaseURL
		if base == "" {
			base = "https://api.eu.lever.co"
		}
	}
	var postings []leverPosting
	if err := l.Client.GetJSON(ctx, base+"/v0/postings/"+url.PathEscape(c.Token)+"?mode=json", &postings); err != nil {
		return nil, err
	}
	jobs := make([]RawJob, 0, len(postings))
	for _, p := range postings {
		raw := RawJob{
			ExternalID:      p.ID,
			Title:           p.Text,
			URL:             p.HostedURL,
			ApplyURL:        p.ApplyURL,
			DescriptionText: leverText(p),
			EmploymentType:  strings.TrimSpace(p.Categories.Commitment),
			Department:      strings.TrimSpace(p.Categories.Team),
		}
		if p.CreatedAt > 0 {
			raw.PostedAt = time.UnixMilli(p.CreatedAt).UTC()
		}
		if len(p.Categories.AllLocations) > 0 {
			raw.Locations = p.Categories.AllLocations
		} else if p.Categories.Location != "" {
			raw.Locations = []string{p.Categories.Location}
		}
		if p.WorkplaceType != "" {
			raw.WorkplaceType = strPtr(p.WorkplaceType)
		}
		if p.Country != "" {
			raw.CountryHints = []string{p.Country}
		}
		if s := p.SalaryRange; s != nil && s.Currency != "" && periodFromInterval(s.Interval) != "" {
			raw.Salary = &Salary{Min: floatPtr(s.Min), Max: floatPtr(s.Max), Currency: strings.ToUpper(s.Currency), Period: periodFromInterval(s.Interval)}
		}
		jobs = append(jobs, raw)
	}
	return jobs, nil
}

// leverText joins the plain description, each list (heading + items) and the
// closing section.
func leverText(p leverPosting) string {
	parts := []string{textnorm.PlainText(p.DescriptionPlain)}
	if parts[0] == "" {
		parts[0] = textnorm.HTMLToText(p.Description)
	}
	for _, l := range p.Lists {
		parts = append(parts, textnorm.CollapseWhitespace(l.Text), textnorm.HTMLToText(l.Content))
	}
	parts = append(parts, textnorm.PlainText(p.AdditionalPlain))
	var kept []string
	for _, part := range parts {
		if part != "" {
			kept = append(kept, part)
		}
	}
	return strings.Join(kept, "\n")
}
