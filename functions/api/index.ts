// 裸 /api（无后缀路径）也交给同一个入口，与 Cloudflare 的 run_worker_first 行为一致。
export { onRequest } from './[[default]]'
