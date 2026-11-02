package fetch

import (
	"context"
	"net/url"
	"strings"
)

// Ashby reads api.ashbyhq.com/posting-api (verified 2026-11-02).
type Ashby struct {
	Client  Getter
	BaseURL string // default https://api.ashbyhq.com
}

func (a *Ashby) Platform() string { return "ashby" }

type ashbyAddress struct {
	PostalAddress struct {
		AddressCountry string `json:"addressCountry"`
	} `json:"postalAddress"`
}

type ashbyResponse struct {
	Jobs []struct {
		ID                 string        `json:"id"`
		Title              string        `json:"title"`
		Department         string        `json:"department"`
		Team               string        `json:"team"`
		EmploymentType     string        `json:"employmentType"`
		Location           string        `json:"location"`
		Address            *ashbyAddress `json:"address"`
		SecondaryLocations []struct {
			Location string        `json:"location"`
			Address  *ashbyAddress `json:"address"`
		} `json:"secondaryLocations"`
		PublishedAt      string `json:"publishedAt"`
		IsListed         *bool  `json:"isListed"`
		IsRemote         *bool  `json:"isRemote"`
		WorkplaceType    string `json:"workplaceType"`
		JobURL           string `json:"jobUrl"`
		ApplyURL         string `json:"applyUrl"`
		DescriptionHTML  string `json:"descriptionHtml"`
		DescriptionPlain string `json:"descriptionPlain"`
		Compensation     *struct {
			SummaryComponents []struct {
				CompensationType string   `json:"compensationType"`
				Interval         string   `json:"interval"`
				CurrencyCode     *string  `json:"currencyCode"`
				MinValue         *float64 `json:"minValue"`
				MaxValue         *float64 `json:"maxValue"`
			} `json:"summaryComponents"`
		} `json:"compensation"`
	} `json:"jobs"`
}

var ashbyEmploymentTypes = map[string]string{
	"FullTime":  "Full-time",
	"PartTime":  "Part-time",
	"Intern":    "Internship",
	"Contract":  "Contract",
	"Temporary": "Temporary",
}

func (a *Ashby) Fetch(ctx context.Context, c Company) ([]RawJob, error) {
	base := a.BaseURL
	if base == "" {
		base = "https://api.ashbyhq.com"
	}
	var resp ashbyResponse
	endpoint := base + "/posting-api/job-board/" + url.PathEscape(c.Token) + "?includeCompensation=true"
	if err := a.Client.GetJSON(ctx, endpoint, &resp); err != nil {
		return nil, err
	}
	jobs := make([]RawJob, 0, len(resp.Jobs))
	for _, j := range resp.Jobs {
		if j.IsListed != nil && !*j.IsListed {
			continue
		}
		raw := RawJob{
			ExternalID:      j.ID,
			Title:           j.Title,
			URL:             j.JobURL,
			ApplyURL:        j.ApplyURL,
			PostedAt:        parseTime(j.PublishedAt),
			DescriptionText: j.DescriptionPlain,
			DescriptionHTML: j.DescriptionHTML,
			IsRemote:        j.IsRemote,
			Department:      strings.TrimSpace(j.Department),
		}
		if et, ok := ashbyEmploymentTypes[j.EmploymentType]; ok {
			raw.EmploymentType = et
		} else {
			raw.EmploymentType = j.EmploymentType
		}
		if j.WorkplaceType != "" {
			raw.WorkplaceType = strPtr(j.WorkplaceType)
		}
		if j.Location != "" {
			raw.Locations = append(raw.Locations, j.Location)
		}
		if j.Address != nil && j.Address.PostalAddress.AddressCountry != "" {
			raw.CountryHints = append(raw.CountryHints, j.Address.PostalAddress.AddressCountry)
		}
		for _, s := range j.SecondaryLocations {
			if s.Location != "" {
				raw.Locations = append(raw.Locations, s.Location)
			}
			if s.Address != nil && s.Address.PostalAddress.AddressCountry != "" {
				raw.CountryHints = append(raw.CountryHints, s.Address.PostalAddress.AddressCountry)
			}
		}
		if j.Compensation != nil {
			for _, comp := range j.Compensation.SummaryComponents {
				period := periodFromInterval(comp.Interval)
				if comp.CompensationType == "Salary" && comp.CurrencyCode != nil && period != "" {
					raw.Salary = &Salary{Min: floatPtr(comp.MinValue), Max: floatPtr(comp.MaxValue), Currency: strings.ToUpper(*comp.CurrencyCode), Period: period}
					break
				}
			}
		}
		jobs = append(jobs, raw)
	}
	return jobs, nil
}
