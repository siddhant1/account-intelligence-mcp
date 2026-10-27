/**
 * Seed companies. All companies are fictional; websites use the reserved
 * `.example` TLD (RFC 2606), so no seed URL or email resolves to a real domain.
 *
 * Columns: name, industry, country, city, employees, founded, tags, description
 */
type SeedCompany = readonly [string, string, string, string, number, number, string, string];

// prettier-ignore
export const SEED_COMPANIES: readonly SeedCompany[] = [
  // Australia
  ['Signalgrid', 'Software', 'Australia', 'Sydney', 120, 2016, 'B2B data,sales intelligence,AI,data enrichment', 'B2B data platform giving sales and marketing teams AI-powered company and contact intelligence across APAC.'],
  ['Kookaburra AI', 'Artificial Intelligence', 'Australia', 'Brisbane', 85, 2019, 'AI,NLP,LLM,chatbots', 'Conversational AI agents that resolve customer service enquiries for banks and telcos.'],
  ['Southern Cross Analytics', 'Artificial Intelligence', 'Australia', 'Melbourne', 210, 2014, 'AI,machine learning,forecasting,retail', 'Machine learning demand forecasting and supply chain planning for national retailers.'],
  ['Coral Vision', 'Artificial Intelligence', 'Australia', 'Cairns', 34, 2021, 'AI,computer vision,environment,marine', 'Computer vision models that monitor reef health from underwater drone footage.'],
  ['Banksia Pay', 'Fintech', 'Australia', 'Sydney', 340, 2015, 'payments,BNPL,fintech,SMB', 'Buy-now-pay-later and embedded payments for Australian small-business merchants.'],
  ['Ledgerline', 'Fintech', 'Australia', 'Melbourne', 95, 2018, 'accounting,AI,SMB,fintech', 'Automated bookkeeping and tax reconciliation for small businesses, powered by AI.'],
  ['Outback Freight Co', 'Logistics', 'Australia', 'Perth', 1200, 2004, 'freight,last-mile,transport', 'Remote-area freight and last-mile delivery across Western Australia and the Northern Territory.'],
  ['Redgum Health', 'Healthcare', 'Australia', 'Adelaide', 450, 2012, 'telehealth,healthtech,chronic care', 'Telehealth and chronic care management platform for regional and remote patients.'],
  ['Wattle Energy', 'Energy', 'Australia', 'Adelaide', 600, 2011, 'renewables,battery storage,solar', 'Grid-scale battery storage and renewable energy trading for the national electricity market.'],
  ['Ironbark Mining Tech', 'Mining', 'Australia', 'Perth', 780, 2009, 'mining,autonomy,IoT,AI', 'Autonomous haulage and predictive maintenance software for mining fleets, built on machine learning.'],
  ['Bluegum Learning', 'Education', 'Australia', 'Melbourne', 150, 2017, 'edtech,AI,K-12,maths', 'Adaptive K-12 maths platform that uses AI to generate personalised practice.'],
  ['Harbourside Security', 'Cybersecurity', 'Australia', 'Sydney', 260, 2013, 'cybersecurity,MDR,SOC', 'Managed detection and response with a 24/7 security operations centre for mid-market enterprises.'],
  ['Quokka Commerce', 'E-commerce', 'Australia', 'Perth', 70, 2020, 'ecommerce,D2C,headless commerce', 'Headless storefront platform for direct-to-consumer brands.'],
  ['Tasman Robotics', 'Manufacturing', 'Australia', 'Hobart', 55, 2018, 'robotics,automation,AI', 'Collaborative robots with AI vision for food processing and packaging lines.'],
  ['Red Centre Travel Tech', 'Travel', 'Australia', 'Darwin', 40, 2016, 'travel,booking,tourism', 'Booking and channel management software for regional tour operators.'],
  ['Brolga Insurance', 'Insurance', 'Australia', 'Brisbane', 900, 2008, 'insurtech,AI,pricing', 'Digital-first home and contents insurer using AI pricing models.'],
  ['Clearwater Legal AI', 'Legal Tech', 'Australia', 'Canberra', 28, 2022, 'legaltech,AI,LLM,contracts', 'Contract review and clause extraction using large language models.'],
  ['Murray Agritech', 'Agritech', 'Australia', 'Wagga Wagga', 65, 2015, 'agtech,IoT,sustainability,irrigation', 'Soil sensing and irrigation optimisation for broadacre farms.'],
  ['Platypus HR', 'HR Tech', 'Australia', 'Sydney', 130, 2014, 'HR,payroll,workforce management', 'Payroll, rostering and award interpretation for hospitality employers.'],
  ['Spinifex Media', 'Media', 'Australia', 'Sydney', 220, 2010, 'media,podcasts,publishing', 'Independent digital publisher and podcast network.'],
  ['Lyrebird Voice', 'Artificial Intelligence', 'Australia', 'Melbourne', 48, 2020, 'AI,speech recognition,voice,contact centre', 'Speech recognition tuned for Australian accents, used in contact centres.'],
  ['Kestrel Data', 'Software', 'Australia', 'Canberra', 180, 2012, 'data governance,govtech,privacy,SaaS', 'Data governance and privacy compliance platform for government agencies.'],
  // New Zealand
  ['Kiwi Ledger', 'Fintech', 'New Zealand', 'Auckland', 110, 2017, 'open banking,APIs,lending,fintech', 'Open banking APIs and account aggregation for New Zealand lenders.'],
  ['Fernleaf Bio', 'Biotech', 'New Zealand', 'Christchurch', 75, 2016, 'biotech,fermentation,alternative protein', 'Precision fermentation research and contract manufacturing for plant-based proteins.'],
  ['Kauri Cloud', 'Software', 'New Zealand', 'Wellington', 260, 2013, 'cloud,FinOps,SaaS', 'Cloud cost management and FinOps automation for engineering teams.'],
  ['Tui Analytics', 'Artificial Intelligence', 'New Zealand', 'Auckland', 38, 2021, 'AI,sports analytics,computer vision', 'AI-driven performance analytics for professional rugby and cricket teams.'],
  ['Aoraki Energy', 'Energy', 'New Zealand', 'Dunedin', 140, 2010, 'renewables,hydro,wind,IoT', 'Monitoring and optimisation software for hydro and wind generation assets.'],
  // United States
  ['Northgate Robotics', 'Manufacturing', 'United States', 'Pittsburgh', 520, 2012, 'robotics,warehouse automation,AI', 'Warehouse picking robots that learn to grasp new items with reinforcement learning.'],
  ['Cobalt Neural', 'Artificial Intelligence', 'United States', 'San Francisco', 310, 2019, 'AI,LLM,foundation models,MLOps', 'Fine-tuning and evaluation platform for enterprise foundation models.'],
  ['Bayview Health Systems', 'Healthcare', 'United States', 'Boston', 2300, 2001, 'healthtech,EHR,interoperability', 'EHR interoperability and clinical data exchange for hospital networks.'],
  ['Pinecrest Capital Tech', 'Fintech', 'United States', 'New York', 640, 2009, 'trading,risk analytics,fintech', 'Institutional trading infrastructure and real-time risk analytics.'],
  ['Redwood Cyber', 'Cybersecurity', 'United States', 'Austin', 410, 2015, 'cybersecurity,identity,zero trust', 'Identity threat detection and zero-trust access for hybrid workforces.'],
  ['Lakeview Code Academy', 'Education', 'United States', 'Chicago', 90, 2018, 'edtech,coding bootcamp,AI tutoring', 'Online coding bootcamps with AI tutoring and career coaching.'],
  ['Mesa Logistics', 'Logistics', 'United States', 'Phoenix', 1500, 2006, 'freight,trucking,marketplace', 'Cross-border trucking marketplace connecting US and Mexican carriers.'],
  ['Granite Insights', 'Software', 'United States', 'Denver', 75, 2020, 'product analytics,SaaS,B2B', 'Product analytics for B2B SaaS companies.'],
  ['Harborline Media', 'Media', 'United States', 'Los Angeles', 330, 2011, 'streaming,audience measurement,media', 'Streaming analytics and audience measurement for broadcasters.'],
  ['Summit Genomics', 'Biotech', 'United States', 'San Diego', 260, 2014, 'genomics,machine learning,biotech', 'Genomic sequencing analysis using machine learning.'],
  ['Prairie Agritech', 'Agritech', 'United States', 'Des Moines', 120, 2017, 'agtech,drones,precision agriculture', 'Precision spraying drones for corn and soybean growers.'],
  // United Kingdom
  ['Thamesbridge Analytics', 'Artificial Intelligence', 'United Kingdom', 'London', 190, 2016, 'AI,credit risk,machine learning,fintech', 'AI-powered credit risk models for alternative lenders.'],
  ['Pennine Energy', 'Energy', 'United Kingdom', 'Manchester', 350, 2014, 'EV charging,fleet,energy', 'Smart EV charging networks for commercial fleets.'],
  ['Radcliffe Learning', 'Education', 'United Kingdom', 'Oxford', 60, 2019, 'edtech,admissions,tutoring', 'University admissions preparation platform with live tutoring.'],
  ['Highland Shield', 'Cybersecurity', 'United Kingdom', 'Edinburgh', 140, 2015, 'cybersecurity,security awareness,phishing', 'Security awareness training and phishing simulation.'],
  ['Camden Commerce', 'E-commerce', 'United Kingdom', 'London', 480, 2012, 'ecommerce,marketplace,fashion', 'Online marketplace for independent fashion designers.'],
  ['Mersey Health', 'Healthcare', 'United Kingdom', 'Liverpool', 210, 2017, 'healthtech,physiotherapy,digital therapeutics', 'Digital physiotherapy and musculoskeletal care programmes.'],
  ['Cotswold Legal', 'Legal Tech', 'United Kingdom', 'Bristol', 45, 2018, 'legaltech,practice management,SaaS', 'Practice management software for small law firms.'],
  // Singapore
  ['Merlion Remit', 'Fintech', 'Singapore', 'Singapore', 520, 2014, 'payments,remittance,wallets,fintech', 'Cross-border remittance and multi-currency wallets for Southeast Asia.'],
  ['Straits AI', 'Artificial Intelligence', 'Singapore', 'Singapore', 140, 2020, 'AI,LLM,NLP,multilingual', 'Multilingual LLM applications for Southeast Asian languages.'],
  ['Orchard Logistics', 'Logistics', 'Singapore', 'Singapore', 860, 2008, 'shipping,ports,supply chain visibility', 'Port and container visibility platform for shippers and forwarders.'],
  ['Sentosa Health', 'Healthcare', 'Singapore', 'Singapore', 95, 2019, 'healthtech,AI,triage,clinics', 'AI symptom triage and appointment booking for primary care clinics.'],
  ['Marina Cloud', 'Software', 'Singapore', 'Singapore', 300, 2013, 'cloud,Kubernetes,data residency', 'Managed Kubernetes and data-residency cloud for APAC enterprises.'],
  // Canada
  ['Maple Neural', 'Artificial Intelligence', 'Canada', 'Toronto', 230, 2017, 'AI,responsible AI,model monitoring,MLOps', 'Responsible-AI governance and production model monitoring.'],
  ['Rideau Fintech', 'Fintech', 'Canada', 'Ottawa', 85, 2019, 'credit cards,credit building,fintech', 'Credit-building cards and financial coaching for newcomers to Canada.'],
  ['Okanagan Agritech', 'Agritech', 'Canada', 'Kelowna', 50, 2018, 'agtech,yield prediction,machine learning', 'Vineyard and orchard yield prediction from satellite imagery.'],
  ['Fraser Interactive', 'Media', 'Canada', 'Vancouver', 400, 2010, 'gaming,mobile games,live ops', 'Mobile game studio and live-ops platform.'],
  // Germany
  ['Rheinwerk Automation', 'Manufacturing', 'Germany', 'Munich', 1100, 2005, 'industrial IoT,digital twins,automotive', 'Industrial IoT and digital twins for automotive suppliers.'],
  ['Spree Commerce', 'E-commerce', 'Germany', 'Berlin', 260, 2018, 'quick commerce,grocery,ecommerce', 'Quick-commerce software for grocery delivery operators.'],
  ['Elbe Security', 'Cybersecurity', 'Germany', 'Hamburg', 175, 2016, 'cybersecurity,OT security,ICS', 'Security monitoring for operational technology and industrial control systems.'],
  // India
  ['Ganges Analytics', 'Artificial Intelligence', 'India', 'Bengaluru', 600, 2015, 'AI,document AI,insurance,automation', 'Document AI that automates insurance claims processing.'],
  ['Deccan Diagnostics Cloud', 'Healthcare', 'India', 'Hyderabad', 380, 2013, 'healthtech,diagnostics,lab management', 'Management software for diagnostic laboratory networks.'],
  ['Monsoon Pay', 'Fintech', 'India', 'Mumbai', 950, 2016, 'UPI,payments,lending,fintech', 'UPI merchant payments and working-capital loans for neighbourhood stores.'],
  ['Nilgiri Desk', 'Software', 'India', 'Chennai', 210, 2014, 'customer support,helpdesk,SaaS', 'Customer support helpdesk software for SMBs.'],
  // Ireland
  ['Liffey Data', 'Software', 'Ireland', 'Dublin', 120, 2017, 'customer data platform,GDPR,SaaS', 'GDPR-compliant customer data platform for European retailers.'],
];
