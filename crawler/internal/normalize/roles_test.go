package normalize_test

import (
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/normalize"
	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
)

func TestIsDeveloperRole(t *testing.T) {
	n := normalize.New(testutil.Data(t))
	keep := []string{
		"Senior Backend Engineer (Go)", "Software Development Engineer II", "SDE-2", "Frontend Developer",
		"Data Scientist", "Data Analyst", "Machine Learning Engineer", "Staff SRE", "QA Automation Lead",
		"Security Analyst", "Solutions Architect", "Engineering Manager, Payments", "iOS Developer",
		"Full Stack Developer (MERN)", "React Native Lead", "Salesforce Administrator", "Technical Program Manager",
		"Embedded Firmware Intern", "DevOps Specialist",
	}
	drop := []string{
		"Account Executive, Enterprise", "Business Development Representative", "Business Developer - APAC",
		"Recruiter", "Administrative Business Partner", "Office Manager", "Sales Development Representative",
		"Data Entry Operator", "Brand Marketing Manager", "Chief Legal Officer", "Accounts Payable Specialist",
	}
	for _, title := range keep {
		if !n.IsDeveloperRole(title) {
			t.Errorf("want %q kept", title)
		}
	}
	for _, title := range drop {
		if n.IsDeveloperRole(title) {
			t.Errorf("want %q dropped", title)
		}
	}
}
