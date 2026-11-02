package fetch

import (
	"context"
	"net/url"
	"strings"
)

// Workable reads the public widget API apply.workable.com/api/v1/widget
// (verified 2026-11-02). Accounts without the widget return an empty list.
type Workable struct {
	Client  Getter
	BaseURL string // default https://apply.workable.com
}

func (w *Workable) Platform() string { return "workable" }

type workableResponse struct {
	Name string `json:"name"`
	Jobs []struct {
		Title          string `json:"title"`
		Shortcode      string `json:"shortcode"`
		EmploymentType string `json:"employment_type"`
		Telecommuting  bool   `json:"telecommuting"`
		Department     string `json:"department"`
		URL            string `json:"url"`
		ApplicationURL string `json:"application_url"`
		PublishedOn    string `json:"published_on"`
		CreatedAt      string `json:"created_at"`
		City           string `json:"city"`
		State          string `json:"state"`
		Country        string `json:"country"`
		Description    string `json:"description"`
		Locations      []struct {
			Country     string `json:"country"`
			CountryCode string `json:"countryCode"`
			City        string `json:"city"`
			Region      string `json:"region"`
			Hidden      bool   `json:"hidden"`
		} `json:"locations"`
	} `json:"jobs"`
}

func (w *Workable) Fetch(ctx context.Context, c Company) ([]RawJob, error) {
	base := w.BaseURL
	if base == "" {
		base = "https://apply.workable.com"
	}
	var resp workableResponse
	if err := w.Client.GetJSON(ctx, base+"/api/v1/widget/accounts/"+url.PathEscape(c.Token)+"?details=true", &resp); err != nil {
		return nil, err
	}
	jobs := make([]RawJob, 0, len(resp.Jobs))
	for _, j := range resp.Jobs {
		raw := RawJob{
			ExternalID:      j.Shortcode,
			Title:           j.Title,
			URL:             j.URL,
			ApplyURL:        j.ApplicationURL,
			PostedAt:        parseTime(firstNonEmpty(j.PublishedOn, j.CreatedAt)),
			DescriptionHTML: j.Description,
			EmploymentType:  j.EmploymentType,
			Department:      strings.TrimSpace(j.Department),
		}
		if j.Telecommuting {
			raw.IsRemote = boolPtr(true)
		}
		for _, l := range j.Locations {
			if l.Hidden {
				continue
			}
			if loc := joinNonEmpty(l.City, l.Region, l.Country); loc != "" {
				raw.Locations = append(raw.Locations, loc)
			}
			if l.CountryCode != "" {
				raw.CountryHints = append(raw.CountryHints, l.CountryCode)
			}
		}
		if len(raw.Locations) == 0 {
			if loc := joinNonEmpty(j.City, j.State, j.Country); loc != "" {
				raw.Locations = []string{loc}
			}
		}
		if raw.URL == "" && raw.ExternalID != "" {
			raw.URL = "https://apply.workable.com/j/" + url.PathEscape(raw.ExternalID)
		}
		if raw.ApplyURL == "" && raw.URL != "" {
			raw.ApplyURL = strings.TrimSuffix(raw.URL, "/") + "/apply"
		}
		jobs = append(jobs, raw)
	}
	return jobs, nil
}

func joinNonEmpty(values ...string) string {
	var parts []string
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, ", ")
}
