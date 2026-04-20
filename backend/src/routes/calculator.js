import express from 'express';
import * as math from 'mathjs';

const router = express.Router();

// POST /api/calculate
router.post('/calculate', (req, res) => {
  try {
    const { expression } = req.body;
    if (typeof expression !== 'string') {
      return res.status(400).json({ error: 'Expression must be a string' });
    }
    // Evaluate the expression using mathjs
    const result = math.evaluate(expression);
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: 'Invalid expression' });
  }
});

export { router as calculatorRouter };