import { test, expect } from 'vitest';
import { isAuthFailure } from '../utils/syncErrors';

test.each([
  ['RLS violation', { code: '42501', message: 'new row violates row-level security policy for table "condition_surveys"' }],
  ['revoked function', { code: '42501', message: 'permission denied for function restore_deleted_items' }],
  ['expired JWT', { message: 'JWT expired' }],
  ['no session', { status: 401, message: 'Not authenticated' }],
  ['PostgREST JWT error', { code: 'PGRST301', message: 'JWSError' }]
])('treats %s as needing sign-in', (_, err) => {
  expect(isAuthFailure(err)).toBe(true);
});

test.each([
  ['network loss', { message: 'Failed to fetch' }],
  ['timeout', { message: 'network timeout' }],
  ['server error', { status: 500, message: 'Internal Server Error' }],
  ['nothing', null]
])('treats %s as a connection problem, not sign-in', (_, err) => {
  expect(isAuthFailure(err)).toBe(false);
});
