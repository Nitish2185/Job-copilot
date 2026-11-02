package normalize

import "github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"

// developerTitlePhrases mark titles a software developer may want to see.
var developerTitlePhrases = []string{
	"engineer", "engineers", "engineering", "developer", "developers", "programmer", "sde", "swe", "sdet",
	"devops", "devsecops", "sre", "site reliability", "architect", "scientist", "researcher",
	"ml", "machine learning", "data", "analytics", "qa", "quality assurance", "tester", "testing",
	"security", "cyber", "software", "frontend", "front end", "backend", "back end", "full stack",
	"fullstack", "mobile", "android", "ios", "technical", "technology", "tech lead", "database", "dba",
	"firmware", "embedded", "systems administrator", "sysadmin", "it support",
}

// nonDeveloperTitlePhrases override the list above.
var nonDeveloperTitlePhrases = []string{
	"business developer", "business development", "sales development", "data entry",
}

// IsDeveloperRole reports whether a job title belongs in a feed for software
// developers: a technical title, or a title that names a known skill. The shared
// feed keeps only these roles so it stays small and relevant.
func (n *Normalizer) IsDeveloperRole(title string) bool {
	text := n.text.ForMatching(title)
	for _, p := range nonDeveloperTitlePhrases {
		if textnorm.ContainsPhrase(text, p, false) {
			return false
		}
	}
	for _, p := range developerTitlePhrases {
		if textnorm.ContainsPhrase(text, p, false) {
			return true
		}
	}
	return len(n.tagger.Tag(title)) > 0
}
