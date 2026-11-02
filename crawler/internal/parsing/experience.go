// Package parsing is the Go port of shared/src/parsing/{experience,location}.ts.
// Both pass the shared golden cases; see the TypeScript files for the rules.
package parsing

import (
	"regexp"
	"strconv"

	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

const (
	maxYears        = 30
	lookBehindChars = 40
	lookAheadChars  = 50
	followChars     = 25
)

// Same pattern as experience.ts (RE2 and JavaScript agree on this subset).
var (
	experiencePattern  = regexp.MustCompile(`(?:\b(at least|atleast|minimum of|minimum|min\.?|over|more than|up to|upto)\s*)?\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:(?:-|to)\s*(\d{1,2}(?:\.\d{1,2})?)\s*)?(\+)?\s*(?:years?|yrs?|yoe)\b`)
	notExperienceAfter = regexp.MustCompile(`\b(ago|old|history|warranty|degree|of age)\b`)
	experienceNearby   = regexp.MustCompile(`experien|\bexp\b|\byoe\b`)
)

// ExperienceRange is a years-of-experience range; nil means unknown.
type ExperienceRange struct {
	Min *float64 `json:"min,omitempty"`
	Max *float64 `json:"max,omitempty"`
}

type candidate struct {
	min, max *float64
	near     bool
	plain    bool
}

func ptr(v float64) *float64 { return &v }

// ParseExperience finds the years-of-experience range in a job description.
func ParseExperience(norm *textnorm.Normalizer, input string) ExperienceRange {
	text := norm.ForMatching(input)
	var candidates []candidate

	for _, m := range experiencePattern.FindAllStringSubmatchIndex(text, -1) {
		start, end := m[0], m[1]
		group := func(i int) (string, bool) {
			if m[2*i] < 0 {
				return "", false
			}
			return text[m[2*i]:m[2*i+1]], true
		}
		qualifier, hasQualifier := group(1)
		firstText, _ := group(2)
		secondText, hasSecond := group(3)
		_, hasPlus := group(4)

		a, _ := strconv.ParseFloat(firstText, 64)
		var b float64
		if hasSecond {
			b, _ = strconv.ParseFloat(secondText, 64)
		}
		if a > maxYears || (hasSecond && b > maxYears) {
			continue
		}
		if hasSecond && b < a {
			continue
		}
		if notExperienceAfter.MatchString(text[end:min(len(text), end+followChars)]) {
			continue
		}
		window := text[max(0, start-lookBehindChars):min(len(text), end+lookAheadChars)]
		near := experienceNearby.MatchString(window)

		switch {
		case hasSecond:
			candidates = append(candidates, candidate{min: ptr(a), max: ptr(b), near: near})
		case qualifier == "up to" || qualifier == "upto":
			candidates = append(candidates, candidate{max: ptr(a), near: near})
		default:
			candidates = append(candidates, candidate{min: ptr(a), near: near, plain: !hasQualifier && !hasPlus})
		}
	}

	var used []candidate
	for _, c := range candidates {
		if c.near {
			used = append(used, c)
		}
	}
	if len(used) == 0 {
		for _, c := range candidates {
			if !c.plain {
				used = append(used, c)
			}
		}
	}

	var result ExperienceRange
	for _, c := range used {
		if c.min != nil && (result.Min == nil || *c.min < *result.Min) {
			result.Min = ptr(*c.min)
		}
	}
	var maxSeen *float64
	for _, c := range used {
		if c.max != nil && (maxSeen == nil || *c.max > *maxSeen) {
			maxSeen = ptr(*c.max)
		}
	}
	if maxSeen != nil && (result.Min == nil || *maxSeen >= *result.Min) {
		result.Max = maxSeen
	}
	return result
}
