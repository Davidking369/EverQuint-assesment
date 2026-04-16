
/* Max Profit Problem ================== 
Mr. X can build 
 Theatres (T),
 Pubs (P), or Commercial Parks (C) sequentially. 

 Each building earns per unit-of-time it remains operational after being built. 
 Build times: T=5, P=4, C=10 Earn rates: T=$1500/unit, P=$1000/unit, C=$2000/unit 

 Approach: 
 Dynamic Programming dp[t] = maximum earnings achievable with t time units Recurrence: dp[t] = max over each building b where build_time[b] <= t: earn_rate[b] * (t - build_time[b]) + dp[t - build_time[b]] 
 
 Intuition: choosing which building to construct FIRST, then optimally using the remaining time. The building earns for every unit after it is finished, 
 independent of what is built later.

  Time complexity: O(n * B) where B = number of building types (3)
  Space complexity: O(n) 
   
*/

function maxProfitBest(BUILDINGS,totalTime) {
 const dp = Array(totalTime + 1).fill(-Infinity);
  const choice = Array(totalTime + 1).fill(null);
  dp[0] = 0;

  for (let t = 0; t <= totalTime; t++) {
    if (dp[t] === -Infinity) continue;

    for (const { name, buildTime, earnRate } of BUILDINGS) {
      const nt = t + buildTime;
      if (nt > totalTime) continue;

      const val = dp[t] + earnRate * (totalTime - nt);

      if (val > dp[nt]) {
        dp[nt] = val;
        choice[nt] = { name, time: buildTime };
      }
    }
  }

  let bestTime = 0;
  for (let t = 0; t <= totalTime; t++) {
    if (dp[t] > dp[bestTime]) bestTime = t;
  }

  // reconstruct
  const plan = { T: 0, P: 0, C: 0 };
  for (let t = bestTime; choice[t]; t -= choice[t].time)
    plan[choice[t].name]++;

  return {
    profit: dp[bestTime],
    plan
  };
}


// Test cases (from assignment)
const BUILDINGS = [
  { name: 'T', buildTime: 5, earnRate: 1500 },
  { name: 'P', buildTime: 4, earnRate: 1000 },
  { name: 'C', buildTime: 10, earnRate: 2000 }
];

[7, 8, 13].forEach(n => {
  const res = maxProfitBest(BUILDINGS, n);
  console.log(`Time: ${n}`);
  console.log(`Max Profit: $${res.profit}`);
  console.log(`Plan: T:${res.plan.T} P:${res.plan.P} C:${res.plan.C}`);
  console.log('---');
});