package textnorm

import (
	"html"
	"regexp"
	"strings"
)

var (
	scriptBlock = regexp.MustCompile(`(?is)<script\b.*?</script\s*>`)
	styleBlock  = regexp.MustCompile(`(?is)<style\b.*?</style\s*>`)
	blockTag    = regexp.MustCompile(`(?i)<\s*/?\s*(?:br|p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote|pre|hr)\b[^>]*>`)
	anyTag      = regexp.MustCompile(`<[^>]*>`)
	comment     = regexp.MustCompile(`(?s)<!--.*?-->`)
)

// HTMLToText turns job-description HTML into plain text: scripts, styles and
// comments removed, block elements become line breaks, other tags dropped,
// entities decoded, whitespace collapsed per line, empty lines removed.
// shared/testcases/html.cases.json pins the behavior for the TypeScript port.
func HTMLToText(s string) string {
	s = comment.ReplaceAllString(s, " ")
	s = scriptBlock.ReplaceAllString(s, " ")
	s = styleBlock.ReplaceAllString(s, " ")
	s = blockTag.ReplaceAllString(s, "\n")
	s = anyTag.ReplaceAllString(s, " ")
	s = html.UnescapeString(s)
	var lines []string
	for _, line := range strings.Split(s, "\n") {
		if l := CollapseWhitespace(line); l != "" {
			lines = append(lines, l)
		}
	}
	return strings.Join(lines, "\n")
}

// PlainText collapses whitespace per line and drops empty lines, so plain-text
// descriptions from APIs are formatted like HTMLToText output.
func PlainText(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	var lines []string
	for _, line := range strings.Split(s, "\n") {
		if l := CollapseWhitespace(line); l != "" {
			lines = append(lines, l)
		}
	}
	return strings.Join(lines, "\n")
}
