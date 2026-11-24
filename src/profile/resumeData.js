// Resume builder suggestion data: technology profiles and every ready-made list the editor offers.
// Plain data, safe to edit: adding a skill, city or degree here is enough for it to show up in the editor.
/* ---------- ready-made choices (suggestions only: every field still takes free text) ---------- */
// Each profile technology (options.js TECH) → designation, technical skill groups, a summary point and job duties.
// A candidate with several technologies gets the groups merged (same category → skills joined, no repeats).
// dev: false = not a coding role, so the standard Version Control / Project Mgmt / SDLC groups are not added.
const g = (o) => Object.entries(o).map(([cat, items]) => ({ cat, items }))
export const TECH_PROFILES = {
  Python: { role: 'Python Developer', skills: g({
    Programming: 'Python 3, SQL', Frameworks: 'Django 5, Django REST Framework, FastAPI, Flask', 'APIs & Security': 'REST, JWT, OAuth 2.0',
    Databases: 'MySQL 8+, PostgreSQL, MongoDB', ORM: 'SQLAlchemy, Django ORM', 'Cache & Queues': 'Redis, Celery, RabbitMQ',
    'Data & Analytics': 'Pandas, NumPy', Architectures: 'Monolithic, Microservices', 'Unit Testing': 'Pytest, unittest', 'API Testing': 'Postman, Swagger',
    DevOps: 'Docker', 'CI/CD': 'GitHub Actions', AWS: 'EC2, Lambda, S3, SQS, RDS' }),
    summary: 'Expertise in Python, Django, FastAPI and building secure, scalable REST APIs.',
    duties: ['Developed REST APIs using Django REST Framework and FastAPI.', 'Built background tasks and schedulers with Celery and Redis.',
      'Designed database models and optimised queries with SQLAlchemy and Django ORM.', 'Wrote unit tests with Pytest.'] },
  JAVA: { role: 'Java Developer', skills: g({
    Programming: 'Java 17, SQL', Frameworks: 'Spring Boot, Spring MVC, Spring Data JPA', 'APIs & Security': 'REST, Spring Security, JWT',
    Databases: 'MySQL, PostgreSQL, Oracle', ORM: 'Hibernate, JPA', 'Build Tools': 'Maven, Gradle', 'Cache & Queues': 'Redis, Apache Kafka',
    Architectures: 'Monolithic, Microservices', 'Unit Testing': 'JUnit 5, Mockito', 'API Testing': 'Postman, Swagger',
    DevOps: 'Docker, Kubernetes', 'CI/CD': 'Jenkins, GitHub Actions', AWS: 'EC2, S3, RDS', Tools: 'IntelliJ IDEA, Eclipse' }),
    summary: 'Expertise in Java, Spring Boot, Hibernate and microservices architecture.',
    duties: ['Developed microservices using Spring Boot and Spring Data JPA.', 'Secured REST APIs with Spring Security and JWT.',
      'Implemented event-driven communication with Apache Kafka.', 'Wrote unit tests with JUnit and Mockito.'] },
  '.NET': { role: '.NET Developer', skills: g({
    Programming: 'C#, SQL', Frameworks: 'ASP.NET Core, .NET 8, Web API, MVC', 'APIs & Security': 'REST, JWT, OAuth 2.0',
    Databases: 'MS SQL Server', ORM: 'Entity Framework Core, Dapper, LINQ',
    'Microsoft Azure': 'App Service, Azure SQL, Azure Functions, Blob Storage, Active Directory', Architectures: 'Monolithic, Microservices',
    'Unit Testing': 'NUnit, xUnit, Moq', 'API Testing': 'Postman, Swagger', 'CI/CD': 'Azure DevOps, GitHub Actions', Tools: 'Visual Studio, SSMS' }),
    summary: 'Expertise in C#, ASP.NET Core, Entity Framework Core and Microsoft Azure.',
    duties: ['Developed RESTful Web APIs using ASP.NET Core and C#.', 'Implemented data access with Entity Framework Core and SQL Server.',
      'Deployed applications to Azure App Service using Azure DevOps pipelines.', 'Wrote unit tests with NUnit and xUnit.'] },
  'Node.JS': { role: 'Node.js Developer', skills: g({
    Programming: 'JavaScript (ES6+), TypeScript', Backend: 'Node.js', Frameworks: 'Express.js, NestJS', 'APIs & Security': 'REST, GraphQL, JWT',
    Databases: 'MongoDB, MySQL, PostgreSQL', ORM: 'Mongoose, Sequelize, Prisma', 'Cache & Queues': 'Redis, RabbitMQ',
    Architectures: 'Monolithic, Microservices', 'Unit Testing': 'Jest, Mocha', 'API Testing': 'Postman, Swagger',
    DevOps: 'Docker', 'CI/CD': 'GitHub Actions', AWS: 'EC2, Lambda, S3' }),
    summary: 'Expertise in Node.js, Express.js, NestJS and building scalable backend services.',
    duties: ['Developed REST and GraphQL APIs using Node.js and Express.js.', 'Built real-time features with WebSockets (Socket.IO).',
      'Integrated MongoDB using Mongoose with optimised schemas and indexes.', 'Wrote unit tests with Jest.'] },
  PHP: { role: 'PHP Developer', skills: g({
    Programming: 'PHP 8, JavaScript, SQL', Frameworks: 'Laravel, CodeIgniter', CMS: 'WordPress', Databases: 'MySQL, MariaDB', ORM: 'Eloquent',
    'APIs & Security': 'REST, JWT', Frontend: 'HTML5, CSS3, jQuery, Bootstrap 5', 'Unit Testing': 'PHPUnit', 'API Testing': 'Postman',
    'Web Servers': 'Apache, Nginx' }),
    summary: 'Expertise in PHP, Laravel, MySQL and building dynamic web applications.',
    duties: ['Developed web applications and REST APIs using Laravel.', 'Built and customised WordPress themes and plugins.',
      'Designed MySQL schemas and optimised queries.', 'Integrated payment gateways and third-party APIs.'] },
  ReactJS: { role: 'React.js Developer', skills: g({
    Programming: 'JavaScript (ES6+), TypeScript', Frontend: 'React.js, Redux Toolkit, Next.js, React Router', Design: 'Tailwind CSS, Material UI, Bootstrap 5',
    'APIs & Security': 'REST, Axios, GraphQL', 'Unit Testing': 'Jest, React Testing Library', 'Build Tools': 'Vite, Webpack, npm' }),
    summary: 'Expertise in React.js, Redux, TypeScript and building responsive, reusable UI components.',
    duties: ['Built reusable React components and responsive UI with Tailwind CSS.', 'Managed application state with Redux Toolkit.',
      'Integrated REST APIs and handled authentication flows.', 'Improved page performance through code splitting and lazy loading.'] },
  'Cyber Security': { role: 'Cyber Security Analyst', dev: false, skills: g({
    Security: 'VAPT, OWASP Top 10, Threat Analysis, Incident Response', 'Security Tools': 'Burp Suite, Nmap, Wireshark, Metasploit, Nessus',
    SIEM: 'Splunk, IBM QRadar', Networking: 'TCP/IP, Firewalls, VPN, IDS/IPS', 'Operating Systems': 'Kali Linux, Windows, Linux',
    Compliance: 'ISO 27001, NIST, PCI DSS', Scripting: 'Python, Bash' }),
    summary: 'Expertise in vulnerability assessment, penetration testing and security monitoring.',
    duties: ['Performed vulnerability assessments and penetration tests on web applications.', 'Monitored and analysed security events in SIEM.',
      'Investigated and responded to security incidents.', 'Prepared VAPT reports with remediation steps.'] },
  'Tech Supp': { role: 'Technical Support Engineer', dev: false, skills: g({
    'Operating Systems': 'Windows 10/11, Windows Server, Linux', Networking: 'TCP/IP, DNS, DHCP, LAN/WAN, VPN',
    'Tools': 'Active Directory, Microsoft 365, Remote Desktop', 'Ticketing Tools': 'ServiceNow, Jira Service Desk, Freshdesk',
    Hardware: 'Desktop & Laptop Troubleshooting, Printers', 'ITIL': 'Incident, Problem and Change Management' }),
    summary: 'Expertise in troubleshooting hardware, software and network issues with a customer-first approach.',
    duties: ['Resolved L1/L2 hardware, software and network issues within SLA.', 'Managed user accounts and access in Active Directory.',
      'Handled tickets in ServiceNow and maintained the knowledge base.', 'Installed and configured systems, printers and software.'] },
  BA: { role: 'Business Analyst', dev: false, skills: g({
    Analysis: 'Requirement Gathering, Gap Analysis, Process Mapping, Stakeholder Management', Documentation: 'BRD, FRD, SRS, User Stories, Use Cases',
    Tools: 'Jira, Confluence, MS Visio, Balsamiq, Figma', Data: 'SQL, Advanced Excel, Power BI', SDLC: 'Agile, Scrum, Waterfall' }),
    summary: 'Expertise in requirement gathering, documentation and bridging business and technical teams.',
    duties: ['Gathered and documented business requirements (BRD, FRD, user stories).', 'Conducted stakeholder meetings and gap analysis.',
      'Created process flows and wireframes.', 'Supported UAT and sprint planning with the development team.'] },
  'Data Engg': { role: 'Data Engineer', skills: g({
    Programming: 'Python, SQL, PySpark', 'Big Data': 'Apache Spark, Hadoop, Apache Kafka', 'ETL & Orchestration': 'Apache Airflow, AWS Glue, Azure Data Factory',
    'Data Warehouse': 'Snowflake, Amazon Redshift, Google BigQuery', Databases: 'PostgreSQL, MySQL, MongoDB', 'Data & Analytics': 'Pandas, NumPy, Power BI',
    AWS: 'S3, Glue, EMR, Redshift, Lambda' }),
    summary: 'Expertise in building ETL pipelines, data warehouses and big data processing with Spark.',
    duties: ['Built ETL pipelines with PySpark and Apache Airflow.', 'Designed data models in the data warehouse.',
      'Processed large datasets with Apache Spark.', 'Ensured data quality through validation and monitoring.'] },
  'UI/UX': { role: 'UI/UX Designer', skills: g({
    'Design Tools': 'Figma, Adobe XD, Sketch', 'UX Methods': 'User Research, Wireframing, Prototyping, Usability Testing',
    'Visual Design': 'Design Systems, Typography, Colour Theory', Graphics: 'Adobe Photoshop, Adobe Illustrator', Frontend: 'HTML5, CSS3, Tailwind CSS' }),
    summary: 'Expertise in user research, wireframing, prototyping and design systems.',
    duties: ['Designed wireframes, prototypes and high-fidelity UI in Figma.', 'Conducted user research and usability testing.',
      'Built and maintained a reusable design system.', 'Worked closely with developers for pixel-perfect delivery.'] },
  'DevOps (AWS, GCP, AZURE)': { role: 'DevOps Engineer', skills: g({
    Cloud: 'AWS, Microsoft Azure, GCP', AWS: 'EC2, S3, IAM, VPC, EKS, RDS, CloudWatch', Containers: 'Docker, Kubernetes, Helm',
    IaC: 'Terraform, Ansible, CloudFormation', 'CI/CD': 'Jenkins, GitHub Actions, Azure DevOps, GitLab CI', Monitoring: 'Prometheus, Grafana, ELK Stack',
    Scripting: 'Bash, Python, PowerShell', 'Operating Systems': 'Linux (Ubuntu, RHEL)', 'Web Servers': 'Nginx, Apache' }),
    summary: 'Expertise in CI/CD, containerisation, infrastructure as code and cloud platforms (AWS, Azure, GCP).',
    duties: ['Built and maintained CI/CD pipelines with Jenkins and GitHub Actions.', 'Containerised applications with Docker and deployed them on Kubernetes.',
      'Provisioned cloud infrastructure with Terraform.', 'Set up monitoring and alerting with Prometheus and Grafana.'] },
}
export const BACKEND_TECH = ['Python', 'JAVA', '.NET', 'Node.JS', 'PHP']
export const FRONTEND_TECH = ['ReactJS']
export const DESIGNATIONS = [...new Set([...Object.values(TECH_PROFILES).map((p) => p.role),
  ...BACKEND_TECH.map((t) => `Full Stack ${TECH_PROFILES[t].role}`),
  'Software Engineer', 'Sr. Software Engineer', 'Software Developer', 'Jr. Software Engineer', 'Associate Software Engineer',
  'Full Stack Developer', 'Senior Fullstack Developer', 'Frontend Developer', 'Backend Developer', 'Angular Developer',
  'Application Developer', 'QA Engineer', 'Automation Test Engineer', 'Cloud Engineer', 'Data Analyst', 'Tech Lead', 'Team Lead', 'Project Manager'])]
export const SUMMARY_LINES = [
  'Project development, maintenance, support, and deployment expert.',
  'Proficient in technical documentation, project architecture, development, and troubleshooting.',
  'Experienced in working with clients, business managers, technical and non-technical teams.',
  'A good habit of clean and robust coding. Simple and straightforward scripting techniques.',
  'Skilled in development, project management and team handling.',
  'Hands-on with microservices, event-driven systems and cloud-native deployments.',
  'Quick learner with strong analytical and problem-solving skills.',
  'Well versed with Agile methodology and the complete SDLC.',
]
// Skill category → typical skills; picking a category fills the first set when its skills are empty.
export const SKILL_SETS = {
  Programming: ['Python 3, JavaScript, TypeScript, SQL', 'Java, SQL', 'C#, SQL', 'PHP, JavaScript, SQL'],
  Design: ['Bootstrap 5, Tailwind CSS', 'Bootstrap 5, Tailwind CSS, Material UI', 'Figma, Adobe XD'],
  Frontend: ['React.js', 'React.js, Redux, Next.js', 'Angular, TypeScript', 'HTML5, CSS3, JavaScript'],
  Backend: ['Python 3', 'Node.js, Express.js', 'Java, Spring Boot', '.NET 8 Web API', 'PHP, Laravel'],
  Frameworks: ['Django 5, FastAPI', 'Django 5, FastAPI, Flask', 'Spring Boot, Hibernate', 'ASP.NET Core', 'Laravel, CodeIgniter', 'Express.js, NestJS'],
  'APIs & Security': ['REST, JWT', 'REST, GraphQL, JWT, OAuth 2.0'],
  Databases: ['MySQL 8+, PostgreSQL', 'MySQL 8+, PostgreSQL, MongoDB', 'MS SQL Server', 'Oracle, MySQL'],
  ORM: ['SQLAlchemy', 'SQLAlchemy, Django ORM', 'Hibernate, JPA', 'Entity Framework Core', 'Sequelize, Prisma'],
  'Cache & Queues': ['Redis', 'Redis, RabbitMQ, Celery', 'Redis, Kafka', 'Redis, AWS SQS'],
  Architectures: ['Monolithic, Microservices', 'Monolithic, Microservices, Event-driven'],
  'API Testing': ['Postman, Swagger'],
  'Unit Testing': ['Pytest', 'JUnit, Mockito', 'NUnit, xUnit', 'Jest', 'PHPUnit'],
  DevOps: ['Docker', 'Docker, Kubernetes', 'Docker, Kubernetes, Nginx'],
  'CI/CD': ['GitHub Actions', 'GitHub Actions, Jenkins', 'Azure DevOps', 'GitLab CI'],
  AWS: ['EC2, Lambda, S3, SQS, RDS', 'EC2, Lambda, S3, SQS, RDS, CloudWatch'],
  'Microsoft Azure': ['App Service, Azure SQL, Functions', 'App Service, Azure SQL, Functions, Active Directory'],
  GCP: ['Compute Engine, Cloud Run, Cloud SQL'],
  Scripting: ['Bash', 'Bash, PowerShell'],
  'Version Control': ['GitHub, GitLab', 'GitHub, GitLab, Bitbucket'],
  'Project Mgmt': ['Jira, Trello', 'Jira, Trello, Remedy', 'Jira, Confluence'],
  SDLC: ['Agile, Scrum, Kanban', 'Agile, Scrum, Waterfall, Kanban'],
  'Data & Analytics': ['Pandas, NumPy', 'Pandas, NumPy, Power BI', 'Apache Spark, Airflow'],
  Security: ['OWASP, Burp Suite, Nmap', 'Wireshark, Metasploit, Kali Linux'],
  Tools: ['VS Code, PyCharm', 'IntelliJ IDEA, Eclipse', 'Visual Studio'],
  'Operating Systems': ['Windows, Linux (Ubuntu)'],
}
// Every new resume starts with these (after the profile's technologies).
export const DEFAULT_SKILLS = ['Version Control', 'Project Mgmt', 'SDLC'].map((cat) => ({ cat, items: SKILL_SETS[cat][0] }))
export const RESPONSIBILITIES = [
  'Developed new projects from scratch.',
  'Single-handedly developed new projects from scratch.',
  'Led API development and third-party integrations.',
  'Built scalable backend modules and secure REST APIs.',
  'Designed modular frontend architecture for scalability.',
  'Maintained clean, well-documented code.',
  'Conducted code reviews and mentored junior developers.',
  'Optimised database queries and models for high-traffic modules.',
  'Implemented background jobs and schedulers.',
  'Wrote unit tests and improved code coverage.',
  'Managed deployments and environments on the cloud.',
  'Collaborated with clients and stakeholders to gather requirements.',
  'Ensured timely client follow-ups and effective issue resolution.',
  'Provided production support, troubleshooting and defect resolution.',
  'Participated in Agile ceremonies: sprint planning, stand-ups and retrospectives.',
]
export const CONTRIBUTIONS = [
  'Developed backend services and REST APIs.',
  'Built models, APIs, authentication and database operations.',
  'Designed and developed responsive UI screens.',
  'Integrated third-party services and payment gateways.',
  'Implemented role-based access control and authentication.',
  'Automated report generation and data processing.',
  'Optimised performance and reduced response times.',
  'Wrote unit tests and handled bug fixing.',
  'Handled deployment, monitoring and production support.',
  'Collaborated with stakeholders to improve workflows.',
]
// Project "Key: value" lines; the first group is what "Add all common keys" inserts.
export const STACK_KEYS = ['Frontend', 'Backend', 'Database', 'Architecture', 'Cloud', 'Client', 'Team Size', 'Role', 'Domain',
  'ORM', 'APIs', 'Auth', 'Cache', 'Data Processing', 'DevOps', 'Unit Testing', 'API Testing', 'Version Control', 'Ticketing Tool', 'Platform']
export const COMMON_STACK_KEYS = STACK_KEYS.slice(0, 9)
export const DEGREES = ['10th', '12th', 'Diploma', 'B.E.', 'B.Tech', 'B.Sc. (CS)', 'B.Sc. (IT)', 'B.Sc.', 'BCA', 'BCS', 'B.Com', 'BBA', 'BA',
  'M.E.', 'M.Tech', 'M.Sc. (CS)', 'M.Sc. (IT)', 'M.Sc.', 'MCA', 'MCS', 'M.Com', 'MBA', 'PGDAC (CDAC)']
export const SCHOOL = ['10th', '12th']
export const BOARD = 'Maharashtra State Board'
export const INSTITUTES = [BOARD, 'CBSE', 'ICSE', 'MSBTE', 'SPPU University', 'Pune University', 'Mumbai University', 'Shivaji University',
  'Dr. Babasaheb Ambedkar Marathwada University', 'RTM Nagpur University', 'North Maharashtra University', 'Solapur University',
  'SRTM University', 'Amravati University', 'BITS Pilani', 'IGNOU', 'CDAC', 'Savitribai Phule Pune University']
export const SCORE_UNITS = ['%', 'CGPA']
export const ACHIEVEMENTS = [
  'Reduced operational costs by 40% through automation.',
  'Led migration of legacy systems, improving performance by 50%.',
  'Improved API response times by 35% through query and cache tuning.',
  'Received "Star Performer of the Year" award.',
  'Received client appreciation for on-time delivery.',
  'Mentored junior developers and conducted internal trainings.',
  'Certified AWS Cloud Practitioner.',
]
export const HOBBIES = ['Reading', 'Coding', 'Exploring Technology', 'Traveling', 'Singing', 'Music', 'Cricket', 'Chess', 'Photography', 'Cooking', 'Drawing', 'Gaming', 'Yoga', 'Trekking', 'Writing', 'Dancing']
export const STRENGTHS = ['Self-motivated', 'Good Communication Skills', 'Problem-Solving', 'Adaptability', 'Team Leadership', 'Team Player',
  'Quick Learner', 'Time Management', 'Hardworking', 'Positive Attitude', 'Analytical Thinking', 'Attention to Detail']
export const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Kannada', 'Telugu', 'Tamil', 'Bengali', 'Punjabi', 'Urdu', 'Malayalam']
export const MARITAL = ['Bachelor', 'Married'] // '' = leave out of the resume
export const CITIES = ['Pune, Maharashtra', 'Mumbai, Maharashtra', 'Thane, Maharashtra', 'Navi Mumbai, Maharashtra', 'Nashik, Maharashtra',
  'Nagpur, Maharashtra', 'Chhatrapati Sambhajinagar, Maharashtra', 'Kolhapur, Maharashtra', 'Solapur, Maharashtra', 'Satara, Maharashtra',
  'Sangli, Maharashtra', 'Ahilyanagar, Maharashtra', 'Jalgaon, Maharashtra', 'Latur, Maharashtra', 'Nanded, Maharashtra', 'Amravati, Maharashtra',
  'Akola, Maharashtra', 'Dhule, Maharashtra', 'Ratnagiri, Maharashtra', 'Beed, Maharashtra', 'Bengaluru, Karnataka', 'Hyderabad, Telangana',
  'Chennai, Tamil Nadu', 'Delhi', 'Noida, Uttar Pradesh', 'Gurugram, Haryana', 'Ahmedabad, Gujarat', 'Indore, Madhya Pradesh']

/* ---------- standard projects (Adysun Ventures) ---------- */
// Every new resume gets these, written for the resume's technology stack; switching the stack rewrites the ones not edited by hand.
// A project = its own facts (client, team, domain…) + a per-technology "Key: value" stack and three one-line contributions.
export const PROJECT_COMPANY = 'Adysun Ventures Pvt. Ltd.'
export const READY_PROJECTS = [
  { name: 'ALLEGRO', client: 'EU', team: 5, domain: 'E-Commerce & Marketplace', arch: 'Microservices', area: 'e-commerce', only: ['Data Engg'],
    features: 'catalogue, order, and payment workflows', data: 'high-volume e-commerce data',
    de: { stack: 'Backend: Python, SQL, FastAPI\nData Engineering: ETL/ELT, Data Pipelines, Data Transformation\nData Processing: Pandas, PySpark, Apache Spark\nData Orchestration: Apache Airflow\nDatabase: PostgreSQL, MongoDB\nData Warehouse: Snowflake\nCloud: AWS (S3, Glue, Lambda)\nArchitecture: Microservices\nCache: Redis\nDevOps: Docker, Jenkins, GitHub Actions\nUnit Testing: Pytest\nVersion Control: GitHub', bullets: [
      'Developed scalable ETL/ELT pipelines for processing high-volume e-commerce data.',
      'Built data ingestion, transformation, and validation workflows using Python, SQL, Pandas.',
      'Integrated PostgreSQL, MongoDB, and Snowflake for centralized analytics and business reporting.'] } },
  { name: 'SCAUT', client: 'EU', team: 5, domain: 'Background Verification (BGV)', arch: 'Microservices', area: 'BGV',
    features: 'candidate verification workflows and document checks', data: 'candidate, document and verification records',
    python: { backend: 'Python, FastAPI', db: 'PostgreSQL, MongoDB', data: 'Pandas', bullets: [
      'Developed scalable BGV backend services using Python and FastAPI.',
      'Built REST APIs for candidate verification workflows and data processing.',
      'Integrated PostgreSQL and MongoDB with Pandas for data validation and transformation.'] },
    de: { stack: 'Backend: Python, SQL, FastAPI\nData Engineering: ETL/ELT, Data Pipelines, Data Transformation\nData Processing: Pandas, PySpark, Apache Spark\nData Orchestration: Apache Airflow\nDatabase: PostgreSQL, MongoDB\nData Warehouse: Snowflake\nCloud: AWS (S3, Glue, Lambda)\nArchitecture: Microservices\nCache: Redis\nDevOps: Docker, GitHub Actions\nUnit Testing: Pytest\nVersion Control: GitHub', bullets: [
      'Developed scalable data engineering pipelines using Python, Pandas, PySpark, and Apache Spark.',
      'Designed and automated ETL/ELT workflows using Apache Airflow for data processing.',
      'Utilized AWS S3, AWS Glue, and Lambda for scalable cloud-based data processing and storage.'] } },
  { name: 'Newport Sports Management Inc', client: 'USA', team: 8, domain: 'Sports Management', arch: 'Monolithic', area: 'sports management',
    features: 'tournament management, team registration, and scheduling', data: 'tournament, team, player, and match datasets',
    python: { backend: 'Python, Django', db: 'PostgreSQL', data: 'Pandas, NumPy', bullets: [
      'Developed backend services using Python and Django for sports management.',
      'Built features for tournament management, team registration, and scheduling.',
      'Implemented match management and performance tracking workflows.'] },
    de: { stack: 'Backend: Python, Django, FastAPI\nData Engineering: ETL/ELT, Data Pipelines, Data Transformation\nData Processing: Pandas, NumPy\nDatabase: PostgreSQL, MongoDB\nData Orchestration: Apache Airflow\nData Warehouse: Snowflake\nCloud: AWS (S3, Lambda, Glue)\nCache: Redis\nAuth: JWT\nDevOps: Docker, GitHub Actions\nUnit Testing: Pytest\nVersion Control: GitHub', bullets: [
      'Developed scalable ETL pipelines using Python, Pandas, SQL, and Apache Airflow.',
      'Built data processing workflows for tournament, team, player, and match datasets.',
      'Implemented data validation, transformation, and integration across PostgreSQL, MongoDB, and Snowflake.'] } },
  { name: 'HealthOne', client: 'CA', team: 5, domain: 'Health & Medicare', arch: 'Monolithic', area: 'healthcare',
    features: 'health, appointment, and assessment workflows', data: 'health, appointment, and assessment datasets',
    python: { backend: 'Python, Django', db: 'MySQL', bullets: [
      'Developed healthcare backend services using Python and Django.',
      'Implemented health, appointment, and assessment workflows.',
      'Built Django models, APIs, authentication, and MySQL operations.'] },
    de: { stack: 'Backend: Python, FastAPI\nData Engineering: ETL/ELT, Data Pipelines, Data Transformation\nData Processing: Pandas, NumPy\nDatabase: MySQL, PostgreSQL\nData Orchestration: Apache Airflow\nData Warehouse: Snowflake\nCloud: AWS (S3, Glue, Lambda)\nArchitecture: Microservices\nCache: Redis\nAuth: JWT\nDevOps: Docker, GitHub Actions\nUnit Testing: Pytest\nVersion Control: GitHub', bullets: [
      'Developed ETL pipelines using Python, SQL, Pandas, and Apache Airflow for healthcare data processing.',
      'Built data ingestion and transformation workflows for health, appointment, and assessment datasets.',
      'Implemented data validation and integration across MySQL, PostgreSQL, and Snowflake.'] } },
  { name: 'RELIABILITY - Absa Group', client: 'CA', team: 5, domain: 'Banking & Finance', arch: 'Monolithic', area: 'banking data migration',
    platform: 'Ubuntu, Docker', cloud: 'OnPrem', features: 'data transformation, validation, reconciliation, and MIS reporting', data: 'banking transaction datasets',
    python: { backend: 'Python, FastAPI', db: 'Oracle', data: 'Pandas', bullets: [
      'Developed ETL pipelines and FastAPI services for banking data migration.',
      'Implemented data transformation, validation, reconciliation, and MIS reporting.',
      'Optimized data processing with Python, Pandas, SQL, and Oracle.'] },
    de: { stack: 'Platform: Ubuntu, Docker\nBackend: Python, Django, FastAPI\nData Engineering: ETL/ELT, Data Pipelines, Data Transformation\nData Processing: Pandas, PySpark, NumPy\nDatabase: Oracle, PostgreSQL\nData Warehouse: Snowflake\nData Orchestration: Apache Airflow\nArchitecture: Monolithic\nCache: Redis\nAuth: JWT\nCloud: On-Premises, AWS\nVersion Control: GitHub', bullets: [
      'Developed ETL pipelines using Python, SQL, Pandas, and Apache Airflow for banking data processing.',
      'Implemented data transformation, validation, reconciliation, and MIS reporting workflows.',
      'Optimized large-scale data processing using PySpark, Oracle, PostgreSQL, and Snowflake.'] } },
]
// Backend technologies: language + framework (fast = API-first projects), databases, and the rest of the stack line.
// Database: '' = the project's own (MySQL/PostgreSQL/Oracle…) where the technology supports it.
export const PROJECT_TECH = {
  Python: { lang: 'Python', fw: 'Django', fast: 'FastAPI', front: 'React.js, Tailwind CSS', db: '', data: 'Pandas, NumPy', auth: 'JWT', cloud: 'AWS', devops: 'Docker, GitHub Actions', test: 'Pytest' },
  JAVA: { lang: 'Java', fw: 'Spring Boot', fast: 'Spring Boot', extra: 'Hibernate', front: 'React.js, Bootstrap', db: '', auth: 'Spring Security, JWT', cloud: 'AWS', devops: 'Docker, Jenkins', test: 'JUnit 5, Mockito' },
  '.NET': { lang: 'C#', fw: 'ASP.NET Core', fast: 'ASP.NET Core Web API', extra: 'Entity Framework Core', front: 'Angular, Bootstrap', db: 'MS SQL Server', auth: 'JWT, Azure AD', cloud: 'Microsoft Azure', devops: 'Azure DevOps', test: 'xUnit, NUnit' },
  'Node.JS': { lang: 'Node.js', fw: 'Express.js', fast: 'NestJS', extra: 'Prisma', front: 'React.js, Tailwind CSS', db: '', auth: 'JWT', cloud: 'AWS', devops: 'Docker, GitHub Actions', test: 'Jest' },
  PHP: { lang: 'PHP 8', fw: 'Laravel', fast: 'Laravel', extra: 'Eloquent ORM', front: 'Blade, Bootstrap 5, jQuery', db: 'MySQL', auth: 'Laravel Sanctum, JWT', cloud: 'AWS', devops: 'GitHub Actions', test: 'PHPUnit' },
}
// Non-backend technologies: stack keys + three contributions ({area} / {features} = the project's).
export const PROJECT_ROLE_TEXT = {
  ReactJS: { stack: 'Frontend: React.js, Redux Toolkit, Tailwind CSS\nLanguage: JavaScript (ES6+), TypeScript\nAPI Integration: REST, Axios\nAuth: JWT\nUnit Testing: Jest, React Testing Library\nBuild Tools: Vite, npm\nVersion Control: GitHub', bullets: [
    'Built responsive {area} UI screens using React.js and Tailwind CSS.', 'Developed reusable components for {features}.', 'Integrated REST APIs with Redux Toolkit and handled JWT authentication.'] },
  'DevOps (AWS, GCP, AZURE)': { stack: 'Platform: Ubuntu\nCloud: AWS (EC2, EKS, S3)\nContainers: Docker, Kubernetes\nCI/CD: Jenkins, GitHub Actions\nIaC: Terraform\nMonitoring: Prometheus, Grafana\nVersion Control: GitHub', bullets: [
    'Set up CI/CD pipelines for the {area} platform using Jenkins and GitHub Actions.', 'Containerized services with Docker and deployed them on Kubernetes (AWS EKS).', 'Provisioned infrastructure with Terraform and monitored it with Prometheus and Grafana.'] },
  BA: { stack: 'Tools: Jira, Confluence, MS Visio, Figma\nDocumentation: BRD, FRD, User Stories\nData: SQL, Advanced Excel, Power BI\nMethodology: Agile, Scrum', bullets: [
    'Gathered and documented requirements for {features}.', 'Wrote BRD, FRD, and user stories in Jira and Confluence.', 'Supported UAT and sprint planning with the development team.'] },
  'Tech Supp': { stack: 'Ticketing Tool: ServiceNow, Jira Service Desk\nOperating Systems: Windows, Linux\nNetworking: TCP/IP, DNS, VPN\nTools: Active Directory, Microsoft 365', bullets: [
    'Provided L1/L2 support to users of the {area} platform.', 'Resolved incidents and service requests within SLA in ServiceNow.', 'Maintained the knowledge base and escalated defects to the development team.'] },
  'Cyber Security': { stack: 'Security Tools: Burp Suite, Nessus, Nmap\nSIEM: Splunk\nStandards: OWASP Top 10, ISO 27001\nScripting: Python, Bash', bullets: [
    'Performed VAPT on the {area} web applications and APIs.', 'Monitored security events in Splunk and responded to incidents.', 'Prepared remediation reports aligned with OWASP Top 10.'] },
  'UI/UX': { stack: 'Design Tools: Figma, Adobe XD\nUX Methods: User Research, Wireframing, Prototyping\nFrontend: HTML5, CSS3, Tailwind CSS', bullets: [
    'Designed wireframes and prototypes in Figma for {features}.', 'Conducted user research and usability testing with stakeholders.', 'Maintained a design system for a consistent UI across modules.'] },
}
