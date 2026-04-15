
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


const BUILDINGS = [
  { name: 'Theatre', buildTime: 5, earnRate: 1500 },
  { name: 'Pub', buildTime: 4, earnRate: 1000 },
  { name: 'Commercial Park', buildTime: 10, earnRate: 2000 }
];


function maxProfit(totalTime) {
  const dp = new Array(totalTime + 1).fill(0);

  for (let t = 1; t <= totalTime; t++) {

    for (const { buildTime, earnRate } of BUILDINGS) {

      if (buildTime <= t) {

        const profit = earnRate * (t - buildTime) + dp[t - buildTime];

        dp[t] = Math.max(dp[t], (profit));
      }
    }
  }

  return dp[totalTime];
}




// Example usage:
[7, 8, 13].forEach(n => {
  console.log(`Time: ${n} → Profit: $${maxProfit(n)}`);
});