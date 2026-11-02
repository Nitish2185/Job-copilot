package fetch

import (
	"context"
	"net/url"
	"strconv"
	"strings"

	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

const (
	smartRecruitersPageSize = 100
	smartRecruitersMaxPages = 50
	// DefaultDetailCap bounds description fetches per company per run; the rest
	// are fetched in later runs (large employers list thousands of postings).
	DefaultDetailCap = 150
)

// SmartRecruiters reads api.smartrecruiters.com (verified 2026-11-02). The list
// endpoint has no descriptions, so details are fetched only for postings that
// need them (HasDetails returns false), up to DetailCap per company.
type SmartRecruiters struct {
	Client     Getter
	BaseURL    string // default https://api.smartrecruiters.com
	DetailCap  int    // default DefaultDetailCap
	HasDetails func(c Company, externalID string) bool
}

func (s *SmartRecruiters) Platform() string { return "smartrecruiters" }

type srListResponse struct {
	Offset     int `json:"offset"`
	Limit      int `json:"limit"`
	TotalFound int `json:"totalFound"`
	Content    []struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		ReleasedDate string `json:"releasedDate"`
		Location     struct {
			City         string `json:"city"`
			Country      string `json:"country"`
			Remote       bool   `json:"remote"`
			Hybrid       bool   `json:"hybrid"`
			FullLocation string `json:"fullLocation"`
		} `json:"location"`
		Department struct {
			Label string `json:"label"`
		} `json:"department"`
		Function struct {
			Label string `json:"label"`
		} `json:"function"`
		TypeOfEmployment struct {
			Label string `json:"label"`
		} `json:"typeOfEmployment"`
	} `json:"content"`
}

type srDetail struct {
	PostingURL string `json:"postingUrl"`
	ApplyURL   string `json:"applyUrl"`
	JobAd      struct {
		Sections map[string]struct {
			Title string `json:"title"`
			Text  string `json:"text"`
		} `json:"sections"`
	} `json:"jobAd"`
}

var srSectionOrder = []string{"companyDescription", "jobDescription", "qualifications", "additionalInformation"}

func (s *SmartRecruiters) Fetch(ctx context.Context, c Company) ([]RawJob, error) {
	base := s.BaseURL
	if base == "" {
		base = "https://api.smartrecruiters.com"
	}
	detailCap := s.DetailCap
	if detailCap == 0 {
		detailCap = DefaultDetailCap
	}
	companyURL := base + "/v1/companies/" + url.PathEscape(c.Token) + "/postings"

	var jobs []RawJob
	detailsFetched := 0
	for page := 0; page < smartRecruitersMaxPages; page++ {
		var resp srListResponse
		pageURL := companyURL + "?limit=" + strconv.Itoa(smartRecruitersPageSize) + "&offset=" + strconv.Itoa(page*smartRecruitersPageSize)
		if err := s.Client.GetJSON(ctx, pageURL, &resp); err != nil {
			return nil, err
		}
		for _, p := range resp.Content {
			publicURL := "https://jobs.smartrecruiters.com/" + url.PathEscape(c.Token) + "/" + url.PathEscape(p.ID)
			raw := RawJob{
				ExternalID:     p.ID,
				Title:          p.Name,
				URL:            publicURL,
				ApplyURL:       publicURL,
				PostedAt:       parseTime(p.ReleasedDate),
				EmploymentType: p.TypeOfEmployment.Label,
				Department:     firstNonEmpty(p.Department.Label, p.Function.Label),
			}
			if loc := srLocation(p.Location.FullLocation, p.Location.City); loc != "" {
				raw.Locations = []string{loc}
			}
			if p.Location.Country != "" {
				raw.CountryHints = []string{strings.ToUpper(p.Location.Country)}
			}
			switch {
			case p.Location.Remote:
				raw.WorkplaceType = strPtr("remote")
			case p.Location.Hybrid:
				raw.WorkplaceType = strPtr("hybrid")
			}

			needs := s.HasDetails == nil || !s.HasDetails(c, p.ID)
			if needs && detailsFetched < detailCap {
				detailsFetched++
				var d srDetail
				if err := s.Client.GetJSON(ctx, companyURL+"/"+url.PathEscape(p.ID), &d); err == nil {
					if d.PostingURL != "" {
						raw.URL = d.PostingURL
					}
					if d.ApplyURL != "" {
						raw.ApplyURL = d.ApplyURL
					}
					raw.DescriptionText = srText(d)
				} else {
					raw.DetailsMissing = true
				}
			} else {
				raw.DetailsMissing = true
			}
			jobs = append(jobs, raw)
		}
		if len(resp.Content) < smartRecruitersPageSize || (page+1)*smartRecruitersPageSize >= resp.TotalFound {
			break
		}
	}
	return jobs, nil
}

func srText(d srDetail) string {
	var parts []string
	for _, key := range srSectionOrder {
		if sec, ok := d.JobAd.Sections[key]; ok {
			if t := textnorm.HTMLToText(sec.Text); t != "" {
				parts = append(parts, t)
			}
		}
	}
	return strings.Join(parts, "\n")
}

// srLocation turns "pune, , India" into "Pune, India".
func srLocation(full, city string) string {
	if full == "" {
		full = city
	}
	var parts []string
	for _, p := range strings.Split(full, ",") {
		if p = strings.TrimSpace(p); p != "" {
			parts = append(parts, capitalizeWords(p))
		}
	}
	return strings.Join(parts, ", ")
}

func capitalizeWords(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if w != "" && w[0] >= 'a' && w[0] <= 'z' {
			words[i] = string(w[0]-'a'+'A') + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
