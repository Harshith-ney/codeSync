import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Language ID mapping for Judge0
const LANGUAGE_IDS: Record<string, number> = {
  javascript: 93,
  typescript: 94,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
  go: 95,
  rust: 73,
};

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { code, language = 'javascript', stdin = '' } = req.body;
  if (!code) {
    res.status(400).json({ error: 'No code provided' });
    return;
  }

  const languageId = LANGUAGE_IDS[language];
  if (!languageId) {
    res.status(400).json({ error: `Unsupported language: ${language}` });
    return;
  }

  try {
    const baseUrl = process.env.JUDGE0_BASE_URL!;
    const apiKey = process.env.JUDGE0_API_KEY!;

    // Submit
    const submitRes = await fetch(`${baseUrl}/submissions?wait=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': apiKey,
      },
      body: JSON.stringify({
        source_code: code,
        language_id: languageId,
        stdin,
      }),
    });

    const result = await submitRes.json() as {
      stdout?: string;
      stderr?: string;
      compile_output?: string;
      status?: { description: string };
    };

    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || result.compile_output || '',
      status: result.status?.description || 'Unknown',
    });
  } catch {
    res.status(500).json({ error: 'Execution failed' });
  }
});

export default router;
