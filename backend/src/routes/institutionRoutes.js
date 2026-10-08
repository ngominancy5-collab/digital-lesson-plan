import { Router } from 'express';
import * as institutionController from '../controllers/institutionController.js';

const router = Router();

router.get('/', institutionController.list);

export default router;
