# Work Signal

A separate Bangladesh job-market dashboard with a Selenium scraper for permitted public career and job-listing pages.

## Dashboard signals

- Latest roles with title, company, location, work mode, and estimated salary
- Search and filters for work mode, industry, and skill
- Skill demand ranking
- Hiring-company ranking
- Remote-role count and salary summary

The dashboard currently includes illustrative records so the UI works immediately. Replace them with scraped output once a source's selectors are verified.

## Scraper fields

`job_scraper.py` writes `public/jobs.json` with:

- `job_title`
- `company`
- `location`
- `salary`
- `skills`
- `experience`
- `industry`
- `source_url`
- `posted_at`
- `scraped_at`

Run it against a permitted public listing or company-career page:

```bash
pip install -r requirements.txt
python job_scraper.py --url "https://example.com/careers" --card ".job-card" --title ".job-title" --location ".location" --industry "Technology"
```

Use `--headed` while tuning selectors. Public LinkedIn pages and some job boards may block automation or require login; do not bypass those controls. Company career pages and permitted public feeds are the preferred sources for this project.

## Run the app

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.
