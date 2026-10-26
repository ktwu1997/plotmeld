import { createPost } from '../../../lib/agent/http';
export const runtime = 'nodejs';
export const maxDuration = 60;
const post = createPost();
export async function POST(request: Request) { return post(request); }
