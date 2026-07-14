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

function normalizeSource(code: string, language: string) {
  if (language !== 'java') return code;

  if (/public\s+class\s+Main\b/.test(code) || /class\s+Main\b/.test(code)) {
    return code;
  }

  // Judge0 Java runs expect the entry class to be named Main.
  if (/public\s+class\s+\w+\b/.test(code)) {
    return code.replace(/public\s+class\s+\w+\b/, 'public class Main');
  }

  if (/class\s+\w+\b/.test(code)) {
    return code.replace(/class\s+\w+\b/, 'public class Main');
  }

  return code;
}

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
    const baseUrl = process.env.JUDGE0_BASE_URL;
    const apiKey = process.env.JUDGE0_API_KEY;

    if (!baseUrl) {
      res.status(500).json({ error: 'Judge0 is not configured. Set JUDGE0_BASE_URL on the server.' });
      return;
    }

    // Submit
    const submitRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/submissions?wait=true`, {
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-Auth-Token': apiKey } : {}),
      },
      body: JSON.stringify({
        source_code: normalizeSource(code, language),
        language_id: languageId,
        stdin,
      }),
    });

    const result = await submitRes.json().catch(() => ({})) as {
      stdout?: string;
      stderr?: string;
      compile_output?: string;
      status?: { description: string };
      message?: string;
      error?: string;
    };

    if (!submitRes.ok) {
      res.status(502).json({
        error:
          result.message ||
          result.error ||
          `Judge0 request failed with status ${submitRes.status}. Check JUDGE0_BASE_URL and JUDGE0_API_KEY.`,
      });
      return;
    }

    res.json({
      stdout: result.stdout || '',
      stderr: result.stderr || result.compile_output || '',
      status: result.status?.description || 'Unknown',
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError') {
      res.status(504).json({
        error: 'Code execution timed out while contacting Judge0. Check your Judge0 server URL and network access.',
      });
      return;
    }

    res.status(500).json({
      error:
        error?.message ||
        'Execution failed. Verify the Judge0 server URL and network connectivity from the backend.',
    });
  }
});

export default router;
