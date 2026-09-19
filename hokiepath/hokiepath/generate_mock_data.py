"""
HokiePath mock data generator.

Produces CSVs for Unity Catalog Delta tables. Deterministic (seeded), so every
teammate gets identical data. List-valued columns are pipe-delimited ("a|b|c")
and get split into ARRAY<STRING> by the Databricks load notebook.

Company and club names are real where noted; all dates, rooms, recruiter
visits, postings, students and attendance are MOCK.
"""
import csv, random, os
from datetime import date, datetime, timedelta

random.seed(2026)
OUT = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT, exist_ok=True)
J = "|".join


def write(name, rows):
    with open(os.path.join(OUT, f"{name}.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"{name:22s} {len(rows):5d} rows")


# ---------------------------------------------------------------- majors
MAJORS = {
    "CS": ("Computer Science", "Engineering"),
    "CPE": ("Computer Engineering", "Engineering"),
    "EE": ("Electrical Engineering", "Engineering"),
    "ME": ("Mechanical Engineering", "Engineering"),
    "CEE": ("Civil Engineering", "Engineering"),
    "BME": ("Biomedical Engineering", "Engineering"),
    "ISE": ("Industrial and Systems Engineering", "Engineering"),
    "FIN": ("Finance", "Business"),
    "ACIS": ("Accounting and Information Systems", "Business"),
    "BIT": ("Business Information Technology", "Business"),
    "MKTG": ("Marketing", "Business"),
    "MGT": ("Management", "Business"),
    "ECON": ("Economics", "Science"),
    "CMDA": ("Computational Modeling and Data Analytics", "Science"),
    "MATH": ("Mathematics", "Science"),
    "STAT": ("Statistics", "Science"),
    "BIO": ("Biological Sciences", "Science"),
    "PSCI": ("Political Science", "Liberal Arts"),
    "COMM": ("Communication", "Liberal Arts"),
    "ID": ("Industrial Design", "Architecture, Arts & Design"),
}
write("majors", [{"major_code": k, "major_name": v[0], "college": v[1]} for k, v in MAJORS.items()])

# ---------------------------------------------------------------- skills
SKILLS = {
    # technical
    "Python": "Technical", "Java": "Technical", "C/C++": "Technical", "JavaScript": "Technical",
    "React": "Technical", "SQL": "Technical", "Git": "Technical", "Cloud (AWS/Azure/GCP)": "Technical",
    "Data Structures & Algorithms": "Technical", "System Design": "Technical",
    "Machine Learning": "Technical", "Deep Learning": "Technical", "LLMs & AI Agents": "Technical",
    "Spark / Databricks": "Technical", "Data Visualization": "Technical", "Statistics": "Technical",
    "Tableau / Power BI": "Technical", "Network Security": "Technical", "Penetration Testing": "Technical",
    "Linux": "Technical", "Embedded Systems": "Technical", "CAD (SolidWorks)": "Technical",
    "MATLAB": "Technical", "Circuit Design": "Technical", "Structural Analysis": "Technical",
    "Lab Research Methods": "Technical", "Figma": "Technical", "User Research": "Technical",
    # finance / business
    "Excel Modeling": "Finance", "Financial Modeling": "Finance", "DCF Valuation": "Finance",
    "Accounting Fundamentals": "Finance", "LBO Modeling": "Finance", "M&A Concepts": "Finance",
    "Equity Research": "Finance", "Financial Statement Analysis": "Finance", "Auditing": "Finance",
    "Market Sizing": "Business", "Case Interviewing": "Business", "Business Strategy": "Business",
    "Product Roadmapping": "Business", "Supply Chain Analytics": "Business", "Digital Marketing": "Business",
    "Market Research": "Business", "Sales": "Business", "Stochastic Calculus": "Finance",
    # professional
    "Public Speaking": "Professional", "Networking": "Professional", "Technical Writing": "Professional",
    "Leadership": "Professional", "Teamwork": "Professional", "Behavioral Interviewing": "Professional",
    "Project Management": "Professional", "Policy Analysis": "Professional",
}
skill_rows = []
for i, (s, c) in enumerate(SKILLS.items(), 1):
    skill_rows.append({"skill_id": f"SK{i:03d}", "skill_name": s, "category": c})
SKILL_ID = {r["skill_name"]: r["skill_id"] for r in skill_rows}
write("skills", skill_rows)

# ---------------------------------------------------------------- career paths
# O*NET-SOC codes are real federal codes; verify at onetonline.org if you rely on them.
PATHS = [
    ("CP01", "Software Engineering", "15-1252.00", "Tech",
     ["Data Structures & Algorithms", "Python", "Java", "Git", "System Design", "Cloud (AWS/Azure/GCP)", "Behavioral Interviewing"],
     ["CS", "CPE", "CMDA", "MATH"], 132270),
    ("CP02", "Data Science & Analytics", "15-2051.00", "Tech",
     ["Python", "SQL", "Statistics", "Machine Learning", "Data Visualization", "Spark / Databricks"],
     ["CMDA", "CS", "STAT", "MATH", "ECON"], 112590),
    ("CP03", "AI / Machine Learning Engineering", "15-2051.00", "Tech",
     ["Python", "Machine Learning", "Deep Learning", "LLMs & AI Agents", "Cloud (AWS/Azure/GCP)", "System Design"],
     ["CS", "CPE", "CMDA"], 140000),
    ("CP04", "Investment Banking", "13-2051.00", "Finance",
     ["Financial Modeling", "DCF Valuation", "LBO Modeling", "M&A Concepts", "Accounting Fundamentals", "Excel Modeling", "Networking", "Behavioral Interviewing"],
     ["FIN", "ACIS", "ECON"], 110000),
    ("CP05", "Sales & Trading / Markets", "41-3031.00", "Finance",
     ["Financial Statement Analysis", "Excel Modeling", "Statistics", "Python", "Networking", "Public Speaking"],
     ["FIN", "ECON", "MATH"], 105000),
    ("CP06", "Quantitative Finance", "13-2099.01", "Finance",
     ["Python", "C/C++", "Statistics", "Stochastic Calculus", "Machine Learning", "Data Structures & Algorithms"],
     ["MATH", "STAT", "CS", "CMDA"], 150000),
    ("CP07", "Management Consulting", "13-1111.00", "Consulting",
     ["Case Interviewing", "Market Sizing", "Business Strategy", "Excel Modeling", "Public Speaking", "Leadership"],
     ["MGT", "FIN", "ECON", "ISE", "BIT"], 99410),
    ("CP08", "Technology Consulting", "13-1111.00", "Consulting",
     ["Cloud (AWS/Azure/GCP)", "SQL", "Spark / Databricks", "Project Management", "Case Interviewing", "Public Speaking"],
     ["BIT", "CS", "ISE", "CMDA"], 95000),
    ("CP09", "Audit & Assurance", "13-2011.00", "Finance",
     ["Accounting Fundamentals", "Auditing", "Excel Modeling", "Financial Statement Analysis", "Teamwork"],
     ["ACIS", "FIN"], 79880),
    ("CP10", "Cybersecurity", "15-1212.00", "Tech",
     ["Network Security", "Penetration Testing", "Linux", "Python", "Cloud (AWS/Azure/GCP)"],
     ["CS", "CPE", "BIT"], 120360),
    ("CP11", "Product Management", "11-2021.00", "Tech",
     ["Product Roadmapping", "User Research", "SQL", "Business Strategy", "Public Speaking", "Leadership"],
     ["CS", "BIT", "MGT", "ID"], 125000),
    ("CP12", "UX / Product Design", "15-1255.00", "Tech",
     ["Figma", "User Research", "JavaScript", "Public Speaking"],
     ["ID", "CS", "COMM"], 98540),
    ("CP13", "Supply Chain & Operations", "13-1081.00", "Business",
     ["Supply Chain Analytics", "Excel Modeling", "SQL", "Project Management", "Tableau / Power BI"],
     ["ISE", "MGT", "BIT"], 79400),
    ("CP14", "Marketing & Brand Management", "13-1161.00", "Business",
     ["Digital Marketing", "Market Research", "Data Visualization", "Public Speaking"],
     ["MKTG", "COMM", "MGT"], 74680),
    ("CP15", "Mechanical / Aerospace Engineering", "17-2141.00", "Engineering",
     ["CAD (SolidWorks)", "MATLAB", "Structural Analysis", "Project Management", "Technical Writing"],
     ["ME", "ISE"], 99510),
    ("CP16", "Electrical & Embedded Engineering", "17-2071.00", "Engineering",
     ["Circuit Design", "Embedded Systems", "C/C++", "MATLAB"],
     ["EE", "CPE"], 111910),
    ("CP17", "Civil & Infrastructure Engineering", "17-2051.00", "Engineering",
     ["Structural Analysis", "CAD (SolidWorks)", "Project Management", "Technical Writing"],
     ["CEE"], 95890),
    ("CP18", "Biomedical Research & Engineering", "17-2031.00", "Health",
     ["Lab Research Methods", "MATLAB", "Statistics", "Technical Writing", "Python"],
     ["BME", "BIO"], 100730),
    ("CP19", "Public Policy & Government", "19-3094.00", "Government",
     ["Policy Analysis", "Technical Writing", "Statistics", "Public Speaking"],
     ["PSCI", "ECON", "COMM"], 132350),
]
path_rows = []
for pid, name, soc, fam, sk, mj, sal in PATHS:
    path_rows.append({
        "path_id": pid, "path_name": name, "onet_soc_code": soc, "career_family": fam,
        "core_skills": J(sk), "typical_majors": J(mj),
        "median_salary_usd_mock": sal,
        "description": f"Students pursuing {name.lower()} typically build strength in {', '.join(sk[:3])}.",
    })
write("career_paths", path_rows)
PATH = {p[0]: p for p in PATHS}

# path_skills (normalized bridge table: which skills matter for which path)
ps_rows = []
for pid, name, soc, fam, sk, mj, sal in PATHS:
    for rank, s in enumerate(sk, 1):
        ps_rows.append({"path_id": pid, "skill_id": SKILL_ID[s], "skill_name": s,
                        "importance": round(1.0 - (rank - 1) * 0.08, 2)})
write("path_skills", ps_rows)

# ---------------------------------------------------------------- companies (real names, mock details)
COMPANIES = [
    ("Deloitte", "Consulting", "New York, NY", ["CP07", "CP08", "CP09", "CP10"]),
    ("Databricks", "Technology", "San Francisco, CA", ["CP01", "CP02", "CP03", "CP08"]),
    ("Accenture", "Consulting", "Dublin, IE", ["CP08", "CP07", "CP01"]),
    ("EY", "Professional Services", "London, UK", ["CP09", "CP08", "CP07"]),
    ("PwC", "Professional Services", "London, UK", ["CP09", "CP08", "CP07"]),
    ("KPMG", "Professional Services", "Amstelveen, NL", ["CP09", "CP08"]),
    ("Booz Allen Hamilton", "Consulting", "McLean, VA", ["CP10", "CP02", "CP08", "CP01"]),
    ("McKinsey & Company", "Consulting", "New York, NY", ["CP07"]),
    ("Boston Consulting Group", "Consulting", "Boston, MA", ["CP07", "CP08"]),
    ("Bain & Company", "Consulting", "Boston, MA", ["CP07"]),
    ("Goldman Sachs", "Investment Banking", "New York, NY", ["CP04", "CP05", "CP06", "CP01"]),
    ("J.P. Morgan", "Investment Banking", "New York, NY", ["CP04", "CP05", "CP01", "CP02"]),
    ("Morgan Stanley", "Investment Banking", "New York, NY", ["CP04", "CP05", "CP01"]),
    ("Bank of America", "Banking", "Charlotte, NC", ["CP04", "CP05", "CP01"]),
    ("Wells Fargo", "Banking", "San Francisco, CA", ["CP04", "CP02", "CP01"]),
    ("Truist", "Banking", "Charlotte, NC", ["CP04", "CP09", "CP02"]),
    ("Capital One", "Financial Services", "McLean, VA", ["CP01", "CP02", "CP11", "CP05"]),
    ("Citadel", "Quantitative Trading", "Miami, FL", ["CP06", "CP01"]),
    ("Jane Street", "Quantitative Trading", "New York, NY", ["CP06", "CP01"]),
    ("Freddie Mac", "Financial Services", "McLean, VA", ["CP02", "CP01", "CP09"]),
    ("Amazon", "Technology", "Seattle, WA", ["CP01", "CP03", "CP13", "CP11"]),
    ("Microsoft", "Technology", "Redmond, WA", ["CP01", "CP03", "CP11", "CP10"]),
    ("Google", "Technology", "Mountain View, CA", ["CP01", "CP03", "CP11", "CP12"]),
    ("Meta", "Technology", "Menlo Park, CA", ["CP01", "CP03", "CP12"]),
    ("IBM", "Technology", "Armonk, NY", ["CP08", "CP01", "CP03"]),
    ("Cisco", "Technology", "San Jose, CA", ["CP10", "CP01", "CP16"]),
    ("Palantir", "Technology", "Denver, CO", ["CP01", "CP02", "CP08"]),
    ("Lockheed Martin", "Aerospace & Defense", "Bethesda, MD", ["CP15", "CP16", "CP01", "CP10"]),
    ("Northrop Grumman", "Aerospace & Defense", "Falls Church, VA", ["CP15", "CP16", "CP10", "CP01"]),
    ("RTX", "Aerospace & Defense", "Arlington, VA", ["CP15", "CP16", "CP01"]),
    ("Leidos", "Defense & IT", "Reston, VA", ["CP10", "CP01", "CP02"]),
    ("General Dynamics", "Aerospace & Defense", "Reston, VA", ["CP15", "CP16", "CP10"]),
    ("Collins Aerospace", "Aerospace & Defense", "Charlotte, NC", ["CP15", "CP16"]),
    ("Volvo Group", "Manufacturing", "Gothenburg, SE", ["CP15", "CP13"]),
    ("Dominion Energy", "Energy", "Richmond, VA", ["CP16", "CP17", "CP02"]),
    ("Kimley-Horn", "Engineering Services", "Raleigh, NC", ["CP17"]),
    ("Clark Construction", "Construction", "Bethesda, MD", ["CP17", "CP13"]),
    ("Procter & Gamble", "Consumer Goods", "Cincinnati, OH", ["CP14", "CP13", "CP15"]),
    ("Altria", "Consumer Goods", "Richmond, VA", ["CP14", "CP13", "CP09"]),
    ("Hilton", "Hospitality", "McLean, VA", ["CP14", "CP02", "CP11"]),
    ("Carilion Clinic", "Healthcare", "Roanoke, VA", ["CP18", "CP02"]),
    ("Fralin Biomedical Research Institute", "Research", "Roanoke, VA", ["CP18"]),
    ("MITRE", "Research (FFRDC)", "McLean, VA", ["CP10", "CP03", "CP19", "CP02"]),
    ("U.S. Government Accountability Office", "Government", "Washington, DC", ["CP19", "CP09"]),
]
company_rows = []
for i, (n, ind, hq, paths) in enumerate(COMPANIES, 1):
    majors = sorted({m for p in paths for m in PATH[p][5]})
    company_rows.append({
        "company_id": f"CO{i:03d}", "company_name": n, "industry": ind, "headquarters": hq,
        "career_paths": J(paths), "target_majors": J(majors),
        "hires_vt_students": "true",
        "sponsors_visa": random.choice(["true", "false", "unknown"]),
        "avg_vt_hires_per_year_mock": random.randint(3, 85),
    })
write("companies", company_rows)
CO = {r["company_id"]: r for r in company_rows}
CO_BY_PATH = {}
for r in company_rows:
    for p in r["career_paths"].split("|"):
        CO_BY_PATH.setdefault(p, []).append(r["company_id"])

# ---------------------------------------------------------------- clubs
# Names are a mix of real VT orgs and plausible ones; verify on GobblerConnect before demo.
CLUBS = [
    ("COINS", "Finance", ["CP04", "CP05"], ["FIN", "ECON", "ACIS"], "Student investment group focused on equity research and markets."),
    ("SEED (Student-managed Endowment for Educational Development)", "Finance", ["CP04", "CP05", "CP06"], ["FIN", "ECON"], "Student-managed portion of the university endowment."),
    ("Investment Banking Club", "Finance", ["CP04"], ["FIN", "ACIS", "ECON"], "Technical interview prep, modeling workshops, and banker networking."),
    ("Quantitative Finance Society", "Finance", ["CP06", "CP05"], ["MATH", "STAT", "CS", "CMDA", "FIN"], "Quant research, trading competitions, and probability puzzles."),
    ("Beta Alpha Psi", "Accounting", ["CP09"], ["ACIS", "FIN"], "Honor society for accounting and finance students."),
    ("Alpha Kappa Psi", "Business", ["CP07", "CP04", "CP14"], ["FIN", "MGT", "MKTG", "BIT", "ACIS"], "Co-ed professional business fraternity."),
    ("Delta Sigma Pi", "Business", ["CP07", "CP14", "CP09"], ["FIN", "MGT", "MKTG", "ACIS"], "Professional business fraternity."),
    ("VT Consulting Group", "Consulting", ["CP07", "CP08"], ["MGT", "FIN", "ECON", "BIT", "ISE"], "Pro-bono consulting projects and case interview practice."),
    ("Product Management Club", "Product", ["CP11"], ["CS", "BIT", "MGT", "ID"], "PM case practice, product teardowns, and PM speaker series."),
    ("Marketing Association", "Marketing", ["CP14"], ["MKTG", "COMM", "MGT"], "Brand challenges and agency visits."),
    ("Supply Chain Club", "Operations", ["CP13"], ["ISE", "MGT", "BIT"], "Plant tours and supply chain case competitions."),
    ("Entrepreneurship Club", "Entrepreneurship", ["CP11", "CP07"], ["MGT", "CS", "BIT", "ID"], "Founder talks, pitch nights, and startup building."),
    ("ACM at Virginia Tech", "Computing", ["CP01", "CP03"], ["CS", "CPE", "CMDA"], "Programming contests, tech talks, and interview prep."),
    ("VTHacks", "Computing", ["CP01", "CP03", "CP11"], ["CS", "CPE", "CMDA", "EE"], "Organizes Virginia Tech's major hackathon."),
    ("Cyber@VT", "Security", ["CP10"], ["CS", "CPE", "BIT"], "Capture-the-flag competitions and security labs."),
    ("Data Science Club", "Data", ["CP02", "CP03"], ["CMDA", "STAT", "CS", "MATH"], "Kaggle nights, ML reading group, and Databricks workshops."),
    ("Machine Learning @ VT", "Data", ["CP03", "CP02"], ["CS", "CMDA", "CPE"], "Paper reading and applied ML projects."),
    ("Women in Computing", "Computing", ["CP01", "CP11", "CP02"], ["CS", "CPE", "CMDA"], "Community, mentorship, and GHC travel support."),
    ("UX Design Club", "Design", ["CP12", "CP11"], ["ID", "CS", "COMM"], "Design critiques, Figma workshops, and portfolio reviews."),
    ("IEEE Student Branch", "Engineering", ["CP16", "CP01"], ["EE", "CPE"], "Hardware projects and industry nights."),
    ("ASME Student Section", "Engineering", ["CP15"], ["ME", "ISE"], "Design competitions and plant tours."),
    ("ASCE Student Chapter", "Engineering", ["CP17"], ["CEE"], "Steel bridge, concrete canoe, and site visits."),
    ("Biomedical Engineering Society", "Engineering", ["CP18"], ["BME", "BIO"], "Research panels and med-device talks."),
    ("Society of Women Engineers", "Engineering", ["CP15", "CP16", "CP01", "CP17"], ["ME", "EE", "CPE", "CEE", "ISE", "BME", "CS"], "Professional development for women in engineering."),
    ("National Society of Black Engineers", "Engineering", ["CP15", "CP16", "CP01", "CP17"], ["ME", "EE", "CPE", "CEE", "CS", "ISE"], "Professional development and national convention."),
    ("Society of Hispanic Professional Engineers", "Engineering", ["CP15", "CP16", "CP01"], ["ME", "EE", "CPE", "CEE", "CS", "ISE"], "Professional development and national convention."),
    ("Undergraduate Research Society", "Research", ["CP18", "CP03", "CP02"], ["BIO", "BME", "CS", "CMDA", "STAT"], "Helps students find and present undergraduate research."),
    ("Pre-Law & Policy Society", "Policy", ["CP19"], ["PSCI", "ECON", "COMM"], "Policy debates and D.C. networking trips."),
    ("Toastmasters @ VT", "Professional", [], [], "Public speaking practice for any major."),
]
club_rows = []
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"]
for i, (n, cat, paths, majors, desc) in enumerate(CLUBS, 1):
    skills = sorted({s for p in paths for s in PATH[p][4][:3]}) or ["Public Speaking", "Leadership"]
    club_rows.append({
        "club_id": f"CL{i:03d}", "club_name": n, "category": cat,
        "career_paths": J(paths), "majors": J(majors) if majors else "ALL",
        "skills_developed": J(skills), "description": desc,
        "meeting_day": random.choice(DAYS), "meeting_time": random.choice(["18:00", "18:30", "19:00", "19:30"]),
        "members_mock": random.randint(25, 320),
        "application_required": random.choice(["true", "false", "false"]),
        "gobblerconnect_url": "https://gobblerconnect.vt.edu/",
    })
write("clubs", club_rows)

# ---------------------------------------------------------------- courses (verify codes against VT timetable)
COURSES = [
    ("CS 3114", "Data Structures and Algorithms", ["Data Structures & Algorithms", "Java"]),
    ("CS 3214", "Computer Systems", ["C/C++", "Linux", "System Design"]),
    ("CS 4604", "Introduction to Database Management Systems", ["SQL", "System Design"]),
    ("CS 4804", "Introduction to Artificial Intelligence", ["Machine Learning", "Python"]),
    ("CS 4824", "Machine Learning", ["Machine Learning", "Statistics", "Python"]),
    ("CS 3704", "Intermediate Software Design", ["Git", "Project Management", "Teamwork"]),
    ("CS 4264", "Principles of Computer Security", ["Network Security", "Penetration Testing"]),
    ("CS 3744", "Intro to GUI Programming and Graphics", ["JavaScript", "React"]),
    ("CMDA 3634", "Computer Science Foundations for CMDA", ["C/C++", "Python"]),
    ("CMDA 4654", "Intermediate Data Analytics and Machine Learning", ["Machine Learning", "Statistics"]),
    ("STAT 3005", "Statistical Methods", ["Statistics"]),
    ("FIN 3104", "Introduction to Finance", ["Financial Statement Analysis", "DCF Valuation"]),
    ("FIN 3144", "Investments", ["Equity Research", "Financial Statement Analysis"]),
    ("FIN 4114", "Financial Modeling", ["Financial Modeling", "Excel Modeling", "LBO Modeling"]),
    ("FIN 4124", "Mergers, Acquisitions and Corporate Restructuring", ["M&A Concepts", "DCF Valuation"]),
    ("ACIS 2115", "Principles of Accounting", ["Accounting Fundamentals"]),
    ("ACIS 3115", "Intermediate Financial Accounting", ["Accounting Fundamentals", "Financial Statement Analysis"]),
    ("ACIS 4314", "Auditing", ["Auditing"]),
    ("BIT 2406", "Quantitative Methods", ["Excel Modeling", "Statistics"]),
    ("BIT 4444", "Business Analytics and Data Visualization", ["Tableau / Power BI", "Data Visualization", "SQL"]),
    ("BIT 4454", "Cloud Computing for Business", ["Cloud (AWS/Azure/GCP)", "Spark / Databricks"]),
    ("MGT 3304", "Management Theory and Leadership Practice", ["Leadership", "Teamwork"]),
    ("MGT 4394", "Strategic Management", ["Business Strategy", "Case Interviewing"]),
    ("MKTG 3104", "Marketing Management", ["Market Research", "Digital Marketing"]),
    ("ISE 3414", "Probabilistic Operations Research", ["Supply Chain Analytics", "Statistics"]),
    ("ME 2024", "Engineering Design and Economics", ["CAD (SolidWorks)", "Project Management"]),
    ("ECE 2514", "Computational Engineering", ["C/C++", "MATLAB"]),
    ("ECE 4534", "Embedded System Design", ["Embedded Systems", "C/C++"]),
    ("MATH 4425", "Mathematical Finance", ["Stochastic Calculus", "Statistics"]),
    ("COMM 2014", "Public Speaking", ["Public Speaking"]),
    ("ENGL 3764", "Technical Writing", ["Technical Writing"]),
    ("PSCI 3824", "Public Policy Analysis", ["Policy Analysis"]),
]
course_rows = [{"course_code": c, "course_title": t, "skills_taught": J(s),
                "department": c.split()[0], "offered_terms": random.choice(["Fall|Spring", "Fall", "Spring", "Fall|Spring|Summer"])}
               for c, t, s in COURSES]
write("courses", course_rows)

# ---------------------------------------------------------------- locations (real VT buildings)
LOCS = ["Squires Student Center", "Goodwin Hall", "Torgersen Hall", "McBryde Hall", "Pamplin Hall",
        "Newman Library", "Johnston Student Center", "Kelly Hall", "Data and Decision Sciences Building",
        "Graduate Life Center", "Owens Banquet Hall", "Holden Hall", "Durham Hall", "Virtual (Zoom)"]
BIG = ["Cassell Coliseum", "Squires Commonwealth Ballroom", "Rector Field House"]

# ---------------------------------------------------------------- events
TERM_START = date(2026, 8, 24)
TERM_END = date(2026, 12, 11)
TODAY = date(2026, 9, 19)

def rand_day(start=TERM_START, end=TERM_END, weekdays_only=True):
    while True:
        d = start + timedelta(days=random.randint(0, (end - start).days))
        if not weekdays_only or d.weekday() < 5:
            return d

def ts(d, hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m)

events = []
def add_event(title, etype, d, start, dur_min, loc, host_type, host_name, company_id, club_id,
              paths, majors, skills, capacity, desc, registration_required="true"):
    eid = f"EV{len(events)+1:04d}"
    st = ts(d, start)
    events.append({
        "event_id": eid, "title": title, "event_type": etype,
        "start_ts": st.isoformat(), "end_ts": (st + timedelta(minutes=dur_min)).isoformat(),
        "location": loc, "host_type": host_type, "host_name": host_name,
        "company_id": company_id or "", "club_id": club_id or "",
        "career_paths": J(paths), "target_majors": J(majors) if majors else "ALL",
        "related_skills": J(skills), "capacity": capacity,
        "registration_required": registration_required,
        "is_virtual": "true" if loc.startswith("Virtual") else "false",
        "description": desc,
        "source": "mock",
    })
    return eid

# Flagship real-world anchor events (dates mocked)
add_event("Fall Career and Internship Fair (Day 1: Engineering & Tech)", "career_fair", date(2026, 9, 29), "11:00", 300,
          "Cassell Coliseum", "university", "Career and Professional Development", None, None,
          ["CP01", "CP02", "CP03", "CP10", "CP15", "CP16", "CP17"], ["CS", "CPE", "EE", "ME", "CEE", "BME", "ISE", "CMDA"],
          ["Networking", "Behavioral Interviewing", "Public Speaking"], 4000,
          "University-wide fair. 150+ employers recruiting for internships and full-time roles.", "false")
add_event("Fall Career and Internship Fair (Day 2: Business & All Majors)", "career_fair", date(2026, 9, 30), "11:00", 300,
          "Cassell Coliseum", "university", "Career and Professional Development", None, None,
          ["CP04", "CP05", "CP07", "CP08", "CP09", "CP13", "CP14", "CP19"], [],
          ["Networking", "Behavioral Interviewing", "Public Speaking"], 4000,
          "University-wide fair across business, government, and nonprofit employers.", "false")
add_event("Business Horizons", "career_fair", date(2026, 9, 16), "10:00", 360,
          "Squires Commonwealth Ballroom", "university", "Pamplin College of Business", None, None,
          ["CP04", "CP05", "CP07", "CP08", "CP09", "CP13", "CP14"], ["FIN", "ACIS", "BIT", "MKTG", "MGT", "ECON"],
          ["Networking", "Behavioral Interviewing"], 2500,
          "Pamplin's flagship business career fair.", "false")
add_event("VTHacks", "hackathon", date(2026, 10, 16), "18:00", 2880,
          "Goodwin Hall", "club", "VTHacks", None, "CL014",
          ["CP01", "CP03", "CP11", "CP12"], ["CS", "CPE", "CMDA", "EE", "ID"],
          ["Python", "JavaScript", "LLMs & AI Agents", "Teamwork", "Public Speaking"], 800,
          "36-hour hackathon with sponsor challenges (including a Deloitte x Databricks track).")
add_event("Engineering Expo Spring Preview Night", "networking", date(2026, 11, 5), "17:30", 150,
          "Owens Banquet Hall", "university", "College of Engineering", None, None,
          ["CP15", "CP16", "CP17", "CP18"], ["ME", "EE", "CEE", "BME", "ISE", "CPE"],
          ["Networking"], 400, "Preview night for spring engineering recruiting.")
add_event("Pamplin Case Competition", "case_competition", date(2026, 10, 24), "09:00", 480,
          "Pamplin Hall", "university", "Pamplin College of Business", "CO001", None,
          ["CP07", "CP08"], ["MGT", "FIN", "BIT", "ECON", "ISE"],
          ["Case Interviewing", "Business Strategy", "Market Sizing", "Public Speaking"], 120,
          "Teams of 4 solve a live client case judged by consultants.")
add_event("Undergraduate Research Fair", "research_fair", date(2026, 9, 24), "13:00", 180,
          "Graduate Life Center", "university", "Office of Undergraduate Research", None, "CL027",
          ["CP18", "CP02", "CP03"], ["BIO", "BME", "CS", "CMDA", "STAT", "MATH"],
          ["Lab Research Methods", "Technical Writing"], 600,
          "Meet faculty labs recruiting undergraduate researchers.", "false")

# Company info sessions / coffee chats / OCI (recruiter visits)
INFO_TYPES = [("info_session", 90, "18:00"), ("coffee_chat", 60, "12:00"),
              ("technical_workshop", 120, "17:00"), ("resume_review", 120, "13:00"),
              ("networking", 120, "18:30")]
recruiter_visits = []
for r in company_rows:
    n_visits = random.randint(1, 4) if r["avg_vt_hires_per_year_mock"] > 20 else random.randint(1, 2)
    for _ in range(n_visits):
        etype, dur, start = random.choice(INFO_TYPES)
        paths = r["career_paths"].split("|")
        focus = random.sample(paths, k=min(len(paths), random.randint(1, 2)))
        skills = sorted({s for p in focus for s in PATH[p][4][:4]})
        majors = sorted({m for p in focus for m in PATH[p][5]})
        d = rand_day()
        label = {"info_session": "Info Session", "coffee_chat": "Coffee Chats",
                 "technical_workshop": "Workshop", "resume_review": "Resume Reviews",
                 "networking": "Networking Night"}[etype]
        focus_names = " & ".join(PATH[p][1] for p in focus)
        eid = add_event(f"{r['company_name']} {label}: {focus_names}", etype, d, start, dur,
                        random.choice(LOCS[:-1]), "company", r["company_name"], r["company_id"], None,
                        focus, majors, skills, random.choice([40, 60, 80, 120, 200]),
                        f"Meet {r['company_name']} recruiters and VT alumni. Learn about {focus_names.lower()} "
                        f"internships and full-time roles. Bring a resume.")
        recruiter_visits.append({
            "visit_id": f"RV{len(recruiter_visits)+1:04d}", "company_id": r["company_id"],
            "company_name": r["company_name"], "event_id": eid, "visit_date": d.isoformat(),
            "visit_type": etype, "roles_recruiting": J(focus),
            "majors_targeted": J(majors), "recruiter_count_mock": random.randint(1, 8),
            "vt_alumni_attending": random.choice(["true", "true", "false"]),
            "on_campus_interviews": random.choice(["true", "false", "false"]),
        })
    # career fair booths
    for fair_id, fair_day in (("EV0001", "2026-09-29"), ("EV0002", "2026-09-30"), ("EV0003", "2026-09-16")):
        fair = events[int(fair_id[2:]) - 1]
        overlap = set(r["career_paths"].split("|")) & set(fair["career_paths"].split("|"))
        if overlap and random.random() < 0.75:
            recruiter_visits.append({
                "visit_id": f"RV{len(recruiter_visits)+1:04d}", "company_id": r["company_id"],
                "company_name": r["company_name"], "event_id": fair_id, "visit_date": fair_day,
                "visit_type": "career_fair_booth", "roles_recruiting": J(sorted(overlap)),
                "majors_targeted": J(sorted({m for p in overlap for m in PATH[p][5]})),
                "recruiter_count_mock": random.randint(2, 10),
                "vt_alumni_attending": "true", "on_campus_interviews": random.choice(["true", "false"]),
            })

# Club meetings / workshops
CLUB_EVENT_TEMPLATES = {
    "Finance": ["{s} Workshop", "Stock Pitch Night", "Alumni Panel: Breaking into {p}", "Technical Interview Drill: {s}"],
    "Accounting": ["Big 4 Recruiting Panel", "{s} Study Session"],
    "Business": ["Professional Development Night: {s}", "Alumni Mixer"],
    "Consulting": ["Case Interview Bootcamp", "{s} Workshop", "Consultant Q&A"],
    "Product": ["PM Case Night", "Product Teardown", "{s} Workshop"],
    "Marketing": ["Brand Challenge Kickoff", "{s} Workshop"],
    "Operations": ["Plant Tour Info Night", "{s} Case Practice"],
    "Entrepreneurship": ["Pitch Night", "Founder Fireside Chat"],
    "Computing": ["{s} Workshop", "LeetCode Night", "Tech Talk: {p}", "Mock Technical Interviews"],
    "Security": ["CTF Practice Night", "{s} Lab"],
    "Data": ["{s} Workshop", "Databricks Hands-on Lab", "Kaggle Night"],
    "Design": ["Portfolio Review Night", "{s} Workshop"],
    "Engineering": ["{s} Workshop", "Industry Night", "Design Team Build Session"],
    "Research": ["How to Land a Research Position", "Research Poster Workshop"],
    "Policy": ["Policy Debate Night", "D.C. Internship Panel"],
    "Professional": ["Speech Night", "Impromptu Speaking Practice"],
}
for c in club_rows:
    paths = [p for p in c["career_paths"].split("|") if p]
    skills = c["skills_developed"].split("|")
    templates = CLUB_EVENT_TEMPLATES[c["category"]]
    for _ in range(random.randint(3, 7)):
        t = random.choice(templates)
        s = random.choice(skills)
        p = PATH[random.choice(paths)][1] if paths else "Your Career"
        title = f"{c['club_name'].split(' (')[0]}: " + t.format(s=s, p=p)
        etype = ("workshop" if "Workshop" in t or "Lab" in t or "Drill" in t or "Bootcamp" in t
                 else "speaker" if "Panel" in t or "Talk" in t or "Fireside" in t or "Q&A" in t
                 else "club_meeting")
        add_event(title, etype, rand_day(), c["meeting_time"], random.choice([60, 90, 120]),
                  random.choice(LOCS), "club", c["club_name"], None, c["club_id"],
                  paths, c["majors"].split("|") if c["majors"] != "ALL" else [],
                  sorted({s} | set(random.sample(skills, k=min(1, len(skills))))), random.choice([30, 50, 75, 100]),
                  f"Hosted by {c['club_name']}. Open to all interested students.", random.choice(["true", "false"]))

# Career services workshops (general)
CS_WORKSHOPS = [("Resume Clinic", ["Technical Writing"]), ("LinkedIn Photo & Profile Day", ["Networking"]),
                ("Behavioral Interview Workshop", ["Behavioral Interviewing"]),
                ("Salary Negotiation 101", ["Networking", "Public Speaking"]),
                ("Networking for Introverts", ["Networking"]),
                ("Mock Interview Day", ["Behavioral Interviewing", "Public Speaking"]),
                ("Finding Research Positions", ["Lab Research Methods"]),
                ("Excel for Everyone", ["Excel Modeling"]),
                ("Intro to SQL for Non-CS Majors", ["SQL"]),
                ("Python for Finance", ["Python", "Financial Modeling"]),
                ("AI Agents with Databricks (Hands-on)", ["LLMs & AI Agents", "Spark / Databricks", "Python"])]
for title, skills in CS_WORKSHOPS:
    for _ in range(random.randint(1, 3)):
        paths = sorted({pp[0] for pp in PATHS if set(skills) & set(pp[4])})
        add_event(title, "workshop", rand_day(), random.choice(["12:30", "16:00", "17:30"]), 75,
                  random.choice(["Squires Student Center", "Newman Library", "Virtual (Zoom)"]),
                  "university", "Career and Professional Development", None, None,
                  paths, [], skills, 60, f"{title} led by Career and Professional Development staff.")

events.sort(key=lambda e: e["start_ts"])
write("events", events)
write("recruiter_visits", recruiter_visits)
EV = {e["event_id"]: e for e in events}

# ---------------------------------------------------------------- opportunities (mock postings)
TITLES = {
    "CP01": ["Software Engineer Intern", "Software Engineer I", "Backend Engineer Intern"],
    "CP02": ["Data Analyst Intern", "Data Scientist Intern", "Analytics Associate"],
    "CP03": ["ML Engineer Intern", "AI Engineer (New Grad)", "Applied Scientist Intern"],
    "CP04": ["Investment Banking Summer Analyst", "IB Analyst (Full-time)", "Sophomore IB Insight Program"],
    "CP05": ["Sales & Trading Summer Analyst", "Markets Analyst"],
    "CP06": ["Quantitative Trader Intern", "Quant Research Intern"],
    "CP07": ["Business Analyst Intern", "Consulting Analyst", "Strategy Associate Intern"],
    "CP08": ["Technology Consulting Intern", "Cloud Consultant Analyst", "Data & AI Consulting Intern"],
    "CP09": ["Audit Intern", "Assurance Associate", "Risk Advisory Intern"],
    "CP10": ["Cybersecurity Analyst Intern", "Security Engineer I", "Cyber Consulting Intern"],
    "CP11": ["Associate Product Manager Intern", "Product Analyst"],
    "CP12": ["UX Design Intern", "Product Designer Intern"],
    "CP13": ["Supply Chain Analyst Intern", "Operations Leadership Program"],
    "CP14": ["Brand Management Intern", "Marketing Analyst"],
    "CP15": ["Mechanical Engineering Intern", "Manufacturing Engineer I"],
    "CP16": ["Electrical Engineering Intern", "Embedded Software Intern"],
    "CP17": ["Civil Engineering Intern", "Field Engineer Intern"],
    "CP18": ["Research Assistant", "Clinical Research Intern"],
    "CP19": ["Policy Analyst Intern", "Government Analyst"],
}
opps = []
for r in company_rows:
    for p in r["career_paths"].split("|"):
        for title in random.sample(TITLES[p], k=min(len(TITLES[p]), random.randint(1, 2))):
            kind = "full_time" if any(k in title for k in ["I", "Full-time", "New Grad", "Associate", "Analyst"]) and "Intern" not in title and "Summer" not in title else "internship"
            opps.append({
                "opportunity_id": f"OP{len(opps)+1:04d}", "company_id": r["company_id"],
                "company_name": r["company_name"], "title": title, "opportunity_type": kind,
                "path_id": p, "required_skills": J(PATH[p][4][:4]),
                "preferred_skills": J(PATH[p][4][4:]) if len(PATH[p][4]) > 4 else "",
                "eligible_majors": J(PATH[p][5]),
                "class_years": "Senior" if kind == "full_time" else random.choice(["Junior", "Sophomore|Junior", "Freshman|Sophomore", "Junior|Senior"]),
                "location": random.choice([r["headquarters"], "Arlington, VA", "New York, NY", "Remote", "McLean, VA", "Richmond, VA", "Charlotte, NC"]),
                "min_gpa": random.choice(["", "3.0", "3.2", "3.5"]),
                "posted_date": rand_day(date(2026, 8, 1), TODAY, False).isoformat(),
                "deadline": rand_day(date(2026, 9, 25), date(2026, 12, 15), False).isoformat(),
                "apply_url": "https://example.com/apply (mock)",
                "source": "mock",
            })
# Faculty research positions
LABS = [("Fralin Biomedical Research Institute", "CP18", "Cancer Biology Lab"),
        ("Department of Computer Science", "CP03", "NLP & LLM Agents Lab"),
        ("Department of Computer Science", "CP10", "Systems Security Lab"),
        ("Department of Computer Science", "CP01", "Human-Computer Interaction Lab"),
        ("Department of Statistics", "CP02", "Sports Analytics Lab"),
        ("Pamplin College of Business", "CP05", "Financial Markets Research Group"),
        ("Department of Mechanical Engineering", "CP15", "Robotics & Mechatronics Lab"),
        ("Department of Biomedical Engineering", "CP18", "Tissue Engineering Lab"),
        ("Department of Civil & Environmental Engineering", "CP17", "Smart Infrastructure Lab"),
        ("School of Public & International Affairs", "CP19", "Tech Policy Research Group"),
        ("Virginia Tech Transportation Institute", "CP02", "Driver Behavior Data Lab"),
        ("Department of Electrical & Computer Engineering", "CP16", "Wireless Systems Lab")]
for org, p, lab in LABS:
    opps.append({
        "opportunity_id": f"OP{len(opps)+1:04d}", "company_id": "", "company_name": org,
        "title": f"Undergraduate Researcher: {lab}", "opportunity_type": "research",
        "path_id": p, "required_skills": J(PATH[p][4][:3]), "preferred_skills": J(PATH[p][4][3:]),
        "eligible_majors": J(PATH[p][5]), "class_years": "Sophomore|Junior|Senior",
        "location": "Blacksburg, VA", "min_gpa": random.choice(["", "3.0"]),
        "posted_date": rand_day(date(2026, 8, 15), TODAY, False).isoformat(),
        "deadline": rand_day(date(2026, 10, 1), date(2026, 11, 30), False).isoformat(),
        "apply_url": "https://example.com/apply (mock)", "source": "mock",
    })
write("opportunities", opps)

# ---------------------------------------------------------------- mock students + engagement (for Genie / admin analytics)
FIRST = ["Aiden", "Priya", "Marcus", "Sofia", "Ethan", "Maya", "Jordan", "Aisha", "Liam", "Chloe", "Noah", "Hannah",
         "Diego", "Grace", "Omar", "Emily", "Kevin", "Zoe", "Ryan", "Fatima", "Tyler", "Ava", "Jason", "Mei",
         "Caleb", "Nina", "Luke", "Sara", "Andre", "Olivia", "Raj", "Leah", "Cole", "Ines", "Ben", "Yara"]
LAST = ["Nguyen", "Patel", "Johnson", "Kim", "Garcia", "Smith", "Chen", "Williams", "Brown", "Lee", "Davis",
        "Martinez", "Wilson", "Anderson", "Thomas", "Moore", "Jackson", "Singh", "Lopez", "Clark", "Hall", "Young"]
YEARS = ["Freshman", "Sophomore", "Junior", "Senior"]
students, student_skills = [], []
# Pivoters skew toward "hot" paths, which creates a real supply/demand story for the Genie admin view
PIVOT_WEIGHTS = {"CP03": 10, "CP11": 8, "CP04": 6, "CP08": 6, "CP02": 5, "CP06": 4, "CP07": 4, "CP12": 3}
for i in range(1, 1201):
    major = random.choices(list(MAJORS), weights=[14, 5, 4, 7, 4, 4, 4, 9, 5, 5, 3, 4, 4, 5, 2, 2, 5, 3, 3, 2])[0]
    native = [p for p in PATHS if major in p[5]]
    # ~25% of students want to pivot outside their typical paths (key story for the app)
    pivoting = random.random() < 0.25
    if pivoting:
        target = random.choices(PATHS, weights=[PIVOT_WEIGHTS.get(p[0], 1) for p in PATHS])[0]
    else:
        target = random.choice(native or PATHS)
    sid = f"ST{i:04d}"
    students.append({
        "student_id": sid, "display_name": f"{random.choice(FIRST)} {random.choice(LAST)}",
        "major_code": major, "class_year": random.choice(YEARS),
        "gpa_band": random.choice(["<3.0", "3.0-3.4", "3.5-3.7", "3.8+"]),
        "target_path_id": target[0], "is_pivoting": str(target not in native).lower(),
        "created_at": rand_day(date(2026, 8, 20), TODAY, False).isoformat(),
        "is_synthetic": "true",
    })
    # skills: mostly from native paths, partial coverage of target
    pool = {s for p in native for s in p[4]} | {"Teamwork", "Leadership", "Public Speaking"}
    have = set(random.sample(sorted(pool), k=min(len(pool), random.randint(3, 7))))
    have |= set(random.sample(target[4], k=random.randint(0, 2 if pivoting else 3)))
    for s in sorted(have):
        student_skills.append({"student_id": sid, "skill_id": SKILL_ID[s], "skill_name": s,
                               "proficiency": random.choice(["beginner", "intermediate", "advanced"]),
                               "source": "resume_parse_mock"})
write("students", students)
write("student_skills", student_skills)

# registrations / attendance: students gravitate to events matching their target path
ev_by_path = {}
for e in events:
    for p in e["career_paths"].split("|"):
        if p:
            ev_by_path.setdefault(p, []).append(e["event_id"])
regs = []
for s in students:
    candidates = ev_by_path.get(s["target_path_id"], [])
    k = min(len(candidates), random.randint(1, 8))
    chosen = random.sample(candidates, k=k) + random.sample([e["event_id"] for e in events], k=random.randint(0, 2))
    for eid in sorted(set(chosen)):
        e = EV[eid]
        start = datetime.fromisoformat(e["start_ts"])
        past = start.date() < TODAY
        reg_ts = start - timedelta(days=random.randint(1, 14), hours=random.randint(0, 20))
        by_agent = random.random() < 0.45
        # agent-recommended events are better matches, so they convert to attendance more often
        status = (random.choices(["attended", "no_show"], weights=[82, 18] if by_agent else [64, 36])[0]
                  if past else "registered")
        regs.append({
            "registration_id": f"RG{len(regs)+1:05d}", "student_id": s["student_id"], "event_id": eid,
            "registered_at": reg_ts.isoformat(), "status": status,
            "recommended_by_agent": str(by_agent).lower(),
            "rating_1_5": random.randint(3, 5) if status == "attended" and random.random() < 0.6 else "",
        })
write("event_registrations", regs)
print("done ->", OUT)
