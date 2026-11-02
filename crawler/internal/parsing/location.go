package parsing

import (
	"sort"
	"strings"

	"github.com/Nitish2185/Job-copilot/crawler/internal/shareddata"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

const minPhraseLength = 4

var fillerWords = map[string]bool{
	"remote": true, "hybrid": true, "onsite": true, "on": true, "site": true, "office": true,
	"offices": true, "only": true, "based": true, "anywhere": true, "in": true, "within": true,
	"the": true, "area": true, "metro": true, "greater": true, "region": true, "timezone": true,
	"time": true, "zone": true, "zones": true, "hq": true, "headquarters": true, "flexible": true,
	"wfh": true, "fully": true, "preferred": true, "or": true, "and": true, "of": true, "from": true,
	"work": true, "home": true, "location": true, "locations": true, "multiple": true,
	"various": true, "city": true, "virtual": true, "distributed": true, "first": true,
	"friendly": true, "eligible": true, "available": true, "any": true, "across": true,
	"near": true, "to": true,
}

var separatorChars = map[rune]bool{
	',': true, ';': true, '/': true, '|': true, '(': true, ')': true, '[': true, ']': true, '&': true, '+': true,
}

var separatorWords = []string{" - ", " or ", " and "}

type place struct {
	country string
	kind    string // "country" | "region" | "city"
}

// LocationParser maps location strings to ISO-2 country codes.
type LocationParser struct {
	norm          *textnorm.Normalizer
	searchable    []textnorm.Phrase
	placeByKey    map[string]place
	exactNames    map[string][]place
	abbreviations map[string][]string
	isoCodes      map[string]string
}

// NewLocationParser compiles shared/data/locations.json.
func NewLocationParser(loc shareddata.Locations, norm *textnorm.Normalizer) *LocationParser {
	p := &LocationParser{
		norm:          norm,
		placeByKey:    map[string]place{},
		exactNames:    map[string][]place{},
		abbreviations: map[string][]string{},
		isoCodes:      map[string]string{},
	}
	add := func(text, country, kind string) {
		pl := place{country: country, kind: kind}
		key := kind + ":" + country
		p.placeByKey[key] = pl
		p.exactNames[text] = append(p.exactNames[text], pl)
		if len(text) >= minPhraseLength {
			p.searchable = append(p.searchable, textnorm.Phrase{Text: text, Key: key})
		}
	}
	for _, c := range loc.Countries {
		p.isoCodes[strings.ToLower(c.Code)] = c.Code
		for _, n := range c.Names {
			add(n, c.Code, "country")
		}
	}
	for _, r := range loc.Regions {
		for _, n := range r.Names {
			add(n, r.Country, "region")
		}
		if r.Abbr != "" {
			p.abbreviations[r.Abbr] = append(p.abbreviations[r.Abbr], r.Country)
		}
	}
	for _, c := range loc.Cities {
		for _, n := range c.Names {
			add(n, c.Country, "city")
		}
	}
	textnorm.SortPhrases(p.searchable)
	return p
}

// SplitSegments splits normalized text into cleaned location segments.
func SplitSegments(text string) []string {
	var b strings.Builder
	for _, r := range text {
		if separatorChars[r] {
			b.WriteByte(',')
		} else {
			b.WriteRune(r)
		}
	}
	replaced := b.String()
	for _, w := range separatorWords {
		replaced = strings.ReplaceAll(replaced, w, ",")
	}
	var out []string
	for _, seg := range strings.Split(replaced, ",") {
		if cleaned := cleanSegment(strings.TrimSpace(seg)); cleaned != "" {
			out = append(out, cleaned)
		}
	}
	return out
}

func cleanSegment(seg string) string {
	tokens := strings.FieldsFunc(seg, func(r rune) bool { return r == ' ' || r == '-' })
	var kept []string
	for _, t := range tokens {
		if !fillerWords[t] {
			kept = append(kept, t)
		}
	}
	if len(kept) > 0 {
		return strings.Join(kept, " ")
	}
	return strings.Join(tokens, " ")
}

// Countries returns the sorted ISO-2 codes mentioned in one location string.
func (p *LocationParser) Countries(location string) []string {
	text := p.norm.ForMatching(location)
	found := map[string]bool{}
	cityCountries := map[string]bool{}
	note := func(pl place) {
		found[pl.country] = true
		if pl.kind == "city" {
			cityCountries[pl.country] = true
		}
	}

	textnorm.MatchClaimingPhrases(text, p.searchable, func(ph textnorm.Phrase) { note(p.placeByKey[ph.Key]) })

	var codes []string
	for _, seg := range SplitSegments(text) {
		if exact, ok := p.exactNames[seg]; ok {
			for _, pl := range exact {
				note(pl)
			}
		} else if _, isAbbr := p.abbreviations[seg]; isAbbr {
			codes = append(codes, seg)
		} else if _, isISO := p.isoCodes[seg]; isISO {
			codes = append(codes, seg)
		}
	}

	for _, code := range codes {
		states := append([]string(nil), p.abbreviations[code]...)
		sort.Strings(states)
		resolved := ""
		for _, c := range states {
			if cityCountries[c] {
				resolved = c
				break
			}
		}
		if resolved == "" {
			resolved = p.isoCodes[code]
		}
		if resolved == "" && len(states) > 0 {
			resolved = states[0]
		}
		if resolved != "" {
			found[resolved] = true
		}
	}

	return sortedKeys(found)
}

// CountriesFromLocations unions countries across all of a job's locations.
func (p *LocationParser) CountriesFromLocations(locations []string) []string {
	all := map[string]bool{}
	for _, l := range locations {
		for _, c := range p.Countries(l) {
			all[c] = true
		}
	}
	return sortedKeys(all)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// RemoteInput mirrors the TypeScript RemoteInput.
type RemoteInput struct {
	WorkplaceType *string  `json:"workplaceType"`
	IsRemote      *bool    `json:"isRemote"`
	Locations     []string `json:"locations"`
	Title         string   `json:"title"`
}

// DetectRemote uses API fields first, then "hybrid"/"remote" in locations or title.
func DetectRemote(norm *textnorm.Normalizer, in RemoteInput) string {
	workplace := ""
	if in.WorkplaceType != nil {
		workplace = strings.Map(func(r rune) rune {
			if r == ' ' || r == '-' || r == '_' {
				return -1
			}
			return r
		}, norm.ForMatching(*in.WorkplaceType))
	}
	switch workplace {
	case "remote":
		return "remote"
	case "hybrid":
		return "hybrid"
	case "onsite", "inoffice", "office":
		return "onsite"
	}
	if in.IsRemote != nil && *in.IsRemote {
		return "remote"
	}
	text := norm.ForMatching(strings.Join(append(append([]string{}, in.Locations...), in.Title), " | "))
	if textnorm.ContainsPhrase(text, "hybrid", false) {
		return "hybrid"
	}
	if textnorm.ContainsPhrase(text, "remote", false) ||
		textnorm.ContainsPhrase(text, "wfh", false) ||
		textnorm.ContainsPhrase(text, "work from home", false) {
		return "remote"
	}
	return "unknown"
}
