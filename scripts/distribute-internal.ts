import { appIdentity } from '../app.identity';
import { executeInternalDistribution, parseDistributeCliArgs } from './lib/distribute-core';

// 原因：内网 Mac / GitHub Actions 分发入口，串联本地构建产物上传（蒲公英/自有制品库）与飞书/企微/钉钉群通知
async function main(): Promise<void> {
  const options = parseDistributeCliArgs(process.argv.slice(2), {
    ...process.env,
    DISTRIBUTE_APP_NAME: process.env.DISTRIBUTE_APP_NAME ?? appIdentity.displayName,
  });

  const result = await executeInternalDistribution(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`内网分发执行失败: ${message}\n`);
  process.exit(1);
});
