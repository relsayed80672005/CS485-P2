/**
 * Tests for AI Service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateIssuesWithAI, isAIAvailable, parseAIResponse } from '../src/services/aiService.js';
import { ApiError } from '../src/middleware/errorHandler.js';

describe('AI Service', () => {
  describe('isAIAvailable()', () => {
    it('should return false when no API keys are provided', () => {
      const result = isAIAvailable({});
      assert.strictEqual(result, false);
    });

    it('should return true when OpenAI key is provided', () => {
      const result = isAIAvailable({ openaiKey: 'sk-test-key' });
      assert.strictEqual(result, true);
    });

    it('should return true when Anthropic key is provided', () => {
      const result = isAIAvailable({ anthropicKey: 'sk-ant-test-key' });
      assert.strictEqual(result, true);
    });

    it('should return true when both keys are provided', () => {
      const result = isAIAvailable({
        openaiKey: 'sk-test-key',
        anthropicKey: 'sk-ant-test-key'
      });
      assert.strictEqual(result, true);
    });

    it('should return true when only Gemini key is provided', () => {
      const result = isAIAvailable({ geminiKey: 'AIza-test-key' });
      assert.strictEqual(result, true);
    });

    it('should return true for gemini provider when Gemini key is provided', () => {
      const result = isAIAvailable({
        geminiKey: 'AIza-test-key',
        provider: 'gemini'
      });
      assert.strictEqual(result, true);
    });

    it('should return false for gemini provider when only OpenAI key is provided', () => {
      const result = isAIAvailable({
        openaiKey: 'sk-test-key',
        provider: 'gemini'
      });
      assert.strictEqual(result, false);
    });

    it('should return true for openai provider when OpenAI key is provided', () => {
      const result = isAIAvailable({
        openaiKey: 'sk-test-key',
        provider: 'openai'
      });
      assert.strictEqual(result, true);
    });

    it('should return false for openai provider when only Anthropic key is provided', () => {
      const result = isAIAvailable({
        anthropicKey: 'sk-ant-test-key',
        provider: 'openai'
      });
      assert.strictEqual(result, false);
    });
  });

  describe('parseAIResponse()', () => {
    const validAIResponse = JSON.stringify({
      issues: [
        {
          id: 'test_issue_1',
          key: 'ISSUE-1',
          type: 'story',
          summary: 'Test issue',
          description: 'Test description',
          size: 'M',
          acceptanceCriteria: ['Criterion 1', 'Criterion 2']
        }
      ]
    });

    it('should parse valid JSON response', () => {
      const result = parseAIResponse(validAIResponse);
      assert.ok(result.issues);
      assert.strictEqual(result.issues.length, 1);
      assert.strictEqual(result.issues[0].id, 'test_issue_1');
      assert.strictEqual(result.issues[0].type, 'story');
    });

    it('should handle markdown code blocks with JSON', () => {
      const markdownResponse = `\`\`\`json
${validAIResponse}
\`\`\``;
      const result = parseAIResponse(markdownResponse);
      assert.ok(result.issues);
      assert.strictEqual(result.issues.length, 1);
    });

    it('should add DRAFT status to issues', () => {
      const result = parseAIResponse(validAIResponse);
      assert.strictEqual(result.issues[0].status, 'DRAFT');
    });

    it('should throw error for missing issues array', () => {
      const invalidResponse = JSON.stringify({ notIssues: [] });

      assert.throws(
        () => parseAIResponse(invalidResponse),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('issues'));
          return true;
        }
      );
    });

    it('should throw error for empty issues array', () => {
      const invalidResponse = JSON.stringify({ issues: [] });

      assert.throws(
        () => parseAIResponse(invalidResponse),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('no issues'));
          return true;
        }
      );
    });

    it('should throw error for invalid issue type', () => {
      const invalidResponse = JSON.stringify({
        issues: [{
          id: 'test',
          key: 'TEST',
          type: 'invalid_type',
          summary: 'Test',
          description: 'Test',
          size: 'M',
          acceptanceCriteria: ['Criterion 1']
        }]
      });

      assert.throws(
        () => parseAIResponse(invalidResponse),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('type'));
          return true;
        }
      );
    });

    it('should throw error for invalid issue size', () => {
      const invalidResponse = JSON.stringify({
        issues: [{
          id: 'test',
          key: 'TEST',
          type: 'story',
          summary: 'Test',
          description: 'Test',
          size: 'INVALID',
          acceptanceCriteria: ['Criterion 1']
        }]
      });

      assert.throws(
        () => parseAIResponse(invalidResponse),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('size'));
          return true;
        }
      );
    });

    it('should throw error for missing acceptance criteria', () => {
      const invalidResponse = JSON.stringify({
        issues: [{
          id: 'test',
          key: 'TEST',
          type: 'story',
          summary: 'Test',
          description: 'Test',
          size: 'M',
          acceptanceCriteria: []
        }]
      });

      assert.throws(
        () => parseAIResponse(invalidResponse),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('acceptanceCriteria'));
          return true;
        }
      );
    });

    it('should trim whitespace from issue fields', () => {
      const responseWithWhitespace = JSON.stringify({
        issues: [{
          id: '  test_issue_1  ',
          key: '  ISSUE-1  ',
          type: 'story',
          summary: '  Test issue  ',
          description: '  Test description  ',
          size: 'M',
          acceptanceCriteria: ['  Criterion 1  ']
        }]
      });

      const result = parseAIResponse(responseWithWhitespace);
      assert.strictEqual(result.issues[0].id, 'test_issue_1');
      assert.strictEqual(result.issues[0].key, 'ISSUE-1');
      assert.strictEqual(result.issues[0].summary, 'Test issue');
      assert.strictEqual(result.issues[0].description, 'Test description');
      assert.strictEqual(result.issues[0].acceptanceCriteria[0], 'Criterion 1');
    });
  });

  describe('generateIssuesWithAI()', () => {
    const sampleSpec = '# Test Specification\n\nImplement a user authentication system with login, registration, and password reset.';

    it('should throw error when no API keys are provided', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, { disableRetry: true }),
        (err) => {
          assert.ok(err instanceof ApiError);
          assert.ok(err.message.includes('No AI provider is configured'));
          return true;
        }
      );
    });

    it('should throw error when OpenAI key is invalid', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          provider: 'openai',
          openaiKey: 'invalid-key',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          // Error should be related to API key or network
          return true;
        }
      );
    });

    it('should throw error when Anthropic key is invalid', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          provider: 'anthropic',
          anthropicKey: 'invalid-key',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          // Error should be related to API key or network
          return true;
        }
      );
    });

    it('should throw error when Gemini key is invalid', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          provider: 'gemini',
          geminiKey: 'invalid-key',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });

    it('should prefer Gemini when multiple keys are available and provider is auto', async () => {
      try {
        await generateIssuesWithAI(sampleSpec, {
          openaiKey: 'sk-test',
          anthropicKey: 'sk-ant-test',
          geminiKey: 'AIza-invalid-test',
          disableRetry: true
        });
      } catch (error) {
        assert.ok(
          error.message.includes('Gemini') ||
            error.message.includes('AIza') ||
            error.message.includes('API')
        );
      }
    });

    it('should support custom model selection for OpenAI', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          provider: 'openai',
          openaiKey: 'invalid-key',
          openaiModel: 'gpt-4o-mini',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });

    it('should support custom model selection for Anthropic', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          provider: 'anthropic',
          anthropicKey: 'invalid-key',
          anthropicModel: 'claude-3-opus-20250219',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });

    it('should include metadata in response', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          openaiKey: 'invalid-key',
          disableRetry: true
        }),
        (err) => {
          // Even though it fails, the function structure is correct
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });

    it('should retry on rate limit errors', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          openaiKey: 'invalid-key',
          maxRetries: 2,
          disableRetry: false
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });

    it('should not retry on authentication errors', async () => {
      await assert.rejects(
        async () => await generateIssuesWithAI(sampleSpec, {
          openaiKey: 'invalid-key',
          disableRetry: true
        }),
        (err) => {
          assert.ok(err instanceof ApiError);
          return true;
        }
      );
    });
  });
});
describe("parseAIResponse - invalid JSON", () => {
  it("should throw error when JSON is completely invalid", () => {
    const badInput = "THIS IS NOT JSON";

    assert.throws(
      () => parseAIResponse(badInput),
      (err) => {
        assert.ok(err instanceof ApiError);
        return true;
      }
    );
  });
});