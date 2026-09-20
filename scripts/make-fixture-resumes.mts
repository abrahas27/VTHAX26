/**
 * pnpm fixtures:resumes — write the three sample resumes used by tests and the demo (spec F2).
 * Emits text-based PDFs (Helvetica, no images) so unpdf extracts real text, the way a student's
 * exported resume does. Content is invented for these fictional students.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

interface Resume {
  file: string;
  lines: string[];
}

const RESUMES: Resume[] = [
  {
    file: "cs.pdf",
    lines: [
      "PRIYA RAMAN",
      "Blacksburg, VA | priya.raman@vt.edu | github.com/priyaraman",
      "",
      "EDUCATION",
      "Virginia Tech, Blacksburg VA",
      "B.S. Computer Science, Minor in Mathematics. Expected graduation May 2029.",
      "GPA 3.6/4.0. Relevant coursework: Data Structures and Algorithms, Computer Systems,",
      "Discrete Mathematics, Intro to Software Design.",
      "",
      "EXPERIENCE",
      "Undergraduate Teaching Assistant, VT Department of Computer Science (Aug 2026 - Present)",
      "- Lead weekly lab sections of 30 students for Data Structures and Algorithms in Java.",
      "- Built an autograder in Python that cut grading time for the course staff by 60 percent.",
      "",
      "Software Engineering Intern, Blacksburg Transit Data Team (Jun 2026 - Aug 2026)",
      "- Wrote Python ETL jobs that loaded ridership data into a PostgreSQL warehouse.",
      "- Created SQL reporting views used by three analysts for weekly route planning.",
      "- Used Git and GitHub pull requests for all code review.",
      "",
      "PROJECTS",
      "HokieRides (Python, Flask, SQL) - Carpool matching app for students; built the matching",
      "algorithm and the REST API. Placed top 10 at VTHacks.",
      "Maze Solver Visualizer (Java) - Interactive visualizer for BFS, DFS and A* search.",
      "",
      "SKILLS",
      "Programming: Python, Java, SQL, JavaScript",
      "Tools: Git, Linux, VS Code",
      "Concepts: Data Structures and Algorithms, Object Oriented Design",
      "",
      "ACTIVITIES",
      "ACM at VT, Association for Women in Computing",
    ],
  },
  {
    file: "finance.pdf",
    lines: [
      "MARCUS ELLIOTT",
      "Blacksburg, VA | marcus.elliott@vt.edu",
      "",
      "EDUCATION",
      "Virginia Tech, Pamplin College of Business",
      "B.S. Finance, Minor in Accounting. Expected graduation May 2028.",
      "GPA 3.8/4.0. Coursework: Financial Modeling, Corporate Finance, Financial Statement Analysis.",
      "",
      "EXPERIENCE",
      "Summer Analyst Intern, Regional Commercial Bank, Richmond VA (Jun 2026 - Aug 2026)",
      "- Built three statement financial models in Excel for five middle market credit reviews.",
      "- Performed DCF valuation and comparable company analysis for a $40M acquisition target.",
      "- Presented findings to the credit committee.",
      "",
      "Analyst, SEED Student Managed Endowment, Virginia Tech (Jan 2026 - Present)",
      "- Cover the consumer sector; pitched two long positions to the portfolio committee.",
      "- Run equity research screens and maintain the sector model in Excel.",
      "",
      "PROJECTS",
      "LBO Model Build (Excel) - Built a leveraged buyout model with debt schedules and returns.",
      "",
      "SKILLS",
      "Financial Modeling, DCF Valuation, Excel Modeling, Financial Statement Analysis,",
      "Accounting Fundamentals, Equity Research, Public Speaking",
      "",
      "ACTIVITIES",
      "COINS investment club, SEED",
    ],
  },
  {
    file: "me.pdf",
    lines: [
      "AVA NGUYEN",
      "Blacksburg, VA | ava.nguyen@vt.edu",
      "",
      "EDUCATION",
      "Virginia Tech, College of Engineering",
      "B.S. Mechanical Engineering. Expected graduation May 2028. GPA 3.4/4.0.",
      "Coursework: Statics, Thermodynamics, Machine Design, Engineering Analysis.",
      "",
      "EXPERIENCE",
      "Manufacturing Engineering Intern, Regional Aerospace Supplier (Jun 2026 - Aug 2026)",
      "- Modeled replacement fixtures in SolidWorks, cutting changeover time by 15 percent.",
      "- Ran finite element analysis in ANSYS to validate a bracket redesign under load.",
      "",
      "Research Assistant, VT Mechanical Engineering Vibrations Lab (Sep 2025 - May 2026)",
      "- Processed accelerometer data in MATLAB and documented lab research methods.",
      "",
      "PROJECTS",
      "Baja SAE Suspension (SolidWorks, MATLAB) - Designed and tested front suspension uprights.",
      "",
      "SKILLS",
      "CAD SolidWorks, MATLAB, Structural Analysis, Technical Writing, Project Management, Teamwork",
      "",
      "ACTIVITIES",
      "Baja SAE, American Society of Mechanical Engineers",
    ],
  },
];

/** Escape the characters that are special inside a PDF string literal. */
const escape = (line: string) =>
  line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** Build a single-page PDF with one text block. Hand-rolled to avoid a dependency. */
function buildPdf(lines: string[]): Buffer {
  const content =
    `BT\n/F1 10 Tf\n12 TL\n54 760 Td\n` +
    lines.map((line) => `(${escape(line)}) Tj T*`).join("\n") +
    `\nET\n`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const dir = path.join(process.cwd(), "fixtures", "resumes");
await mkdir(dir, { recursive: true });
for (const resume of RESUMES) {
  const bytes = buildPdf(resume.lines);
  await writeFile(path.join(dir, resume.file), bytes);
  console.log(`wrote fixtures/resumes/${resume.file} (${bytes.length} bytes)`);
}
