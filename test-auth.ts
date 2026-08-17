import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

if (process.env.NODE_ENV === 'production') {
  console.error('test-auth.ts is for local development only.');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!    // anon/publishable, NOT the service key
);

const email = process.env.TEST_AUTH_EMAIL;
const password = process.env.TEST_AUTH_PASSWORD;

if (!email || !password) {
  console.error('Set TEST_AUTH_EMAIL and TEST_AUTH_PASSWORD in .env (see .env.example).');
  process.exit(1);
}

// Try sign-in first; fall back to sign-up on the first run
let { data, error } = await supabase.auth.signInWithPassword({ email, password });

if (error) {
  console.log('Signing up instead...');
  ({ data, error } = await supabase.auth.signUp({ email, password }));
}

if (error) {
  console.error('Auth failed:', error.message);
  process.exit(1);
}

if (!data.session) {
  console.error('No session returned. Is email confirmation still enabled?');
  process.exit(1);
}

console.log('\nUser ID:', data.user?.id);

if (process.env.TEST_AUTH_PRINT_TOKEN === 'true') {
  console.log('\nToken:\n');
  console.log(data.session.access_token);
} else {
  console.log('\nToken issued (set TEST_AUTH_PRINT_TOKEN=true to print it).');
}