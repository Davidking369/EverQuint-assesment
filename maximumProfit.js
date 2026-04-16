const BUILDINGS = [
  { name: 'T', buildTime: 5, earnRate: 1500 },
  { name: 'P', buildTime: 4, earnRate: 1000 },
  { name: 'C', buildTime: 10, earnRate: 2000 }
];

function maxProfitBest(totalTime) {
  const dp = new Array(totalTime + 1).fill(0);
  const choice = new Array(totalTime + 1).fill(null);

  // Build DP table
  for (let t = 1; t <= totalTime; t++) {
    for (const { name, buildTime, earnRate } of BUILDINGS) {
      if (buildTime <= t) {
        const profit =
          earnRate * (t - buildTime) + dp[t - buildTime];

        if (profit > dp[t]) {
          dp[t] = profit;
          choice[t] = { name, buildTime };
        }
      }
    }
  }

  // Reconstruct plan
  const plan = { T: 0, P: 0, C: 0 };
  for (let t = totalTime; choice[t]; t -= choice[t].buildTime)
    plan[choice[t].name]++;

  return {
    maxProfit: dp[totalTime],
    plan
  };
}


// Test cases (from assignment)
[7, 8, 13].forEach(n => {
  const res = maxProfitBest(n);
  console.log(`Time: ${n}`);
  console.log(`Max Profit: $${res.maxProfit}`);
  console.log(`Plan: T:${res.plan.T} P:${res.plan.P} C:${res.plan.C}`);
  console.log('---');
});