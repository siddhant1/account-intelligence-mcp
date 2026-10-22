import type { ToolDefinition } from '../toolDefinition.js';
import { enrichContactTool } from './enrichContact.js';
import { exportContactsTool } from './exportContacts.js';
import { getCompanyTool } from './getCompany.js';
import { searchCompaniesTool } from './searchCompanies.js';
import { searchContactsTool } from './searchContacts.js';

// Each definition has precise input/output types; the registry only needs the common shape.
export const TOOLS = [
  searchCompaniesTool,
  getCompanyTool,
  searchContactsTool,
  enrichContactTool,
  exportContactsTool,
] as unknown as readonly ToolDefinition[];
