import { asyncHandler } from '../utils/errors.js';
import * as institutionService from '../services/institutionService.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await institutionService.listInstitutions({ role: req.query.role, type: req.query.type }));
});
