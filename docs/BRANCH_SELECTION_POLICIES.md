# Branch Selection Policy Framework

AutoResearch supports three branch selection strategies for multi-draft runs. Each policy balances exploitation (picking known good solutions) vs. exploration (finding diverse approaches).

## Available Policies

| Policy | Strategy | Best For |
|--------|----------|----------|
| `best` | Greedy | Optimization, performance tuning, bug fixes, refinement |
| `roulette` | Exploratory | Exploration, creative tasks, novel solutions, broad search |
| `diverse` | Diversity-First | Architecture, design decisions, multi-objective optimization, research |

## Policy Details

### Greedy (`best`)
Selects the branch with the best metric value. This is an exploitative strategy that focuses on known good solutions.

**Behavior:**
- Filters completed drafts with valid numeric metric values
- Sorts by metric value in the configured direction (lower/higher)
- Returns the branch with the best value
- Falls back to pending/first branch if no valid metrics exist

**Recommended for:**
- Optimization tasks where the metric is well-defined
- Performance tuning (latency reduction, memory efficiency)
- Bug fixes where a clear improvement metric exists
- Refinement of existing solutions

### Exploratory (`roulette`)
Randomly selects from completed branches. This is an exploratory strategy that evenly samples the search space.

**Behavior:**
- Randomly selects from all completed branches
- Equal probability for all completed branches regardless of metric
- Good for discovering unexpected solutions

**Recommended for:**
- Exploration of novel solution spaces
- Creative tasks without clear metric optimization
- Initial broad search before narrowing with `best`

### Diversity-First (`diverse`)
Selects the most recently completed branch. This prioritizes exploration of diverse approaches over metric optimization.

**Behavior:**
- Identifies the branch with the highest iteration number
- Returns the most recently completed draft
- Useful when iteration number correlates with approach diversity

**Recommended for:**
- Architecture decisions with multiple valid approaches
- Design decisions with trade-offs between competing objectives
- Multi-objective optimization problems
- Research tasks where diverse exploration matters more than immediate metric improvement

## Configuration

### Per-Run Configuration
Set the default policy for all drafts in a run:

```json
{
  "num_drafts": 4,
  "branch_selection_policy": "best"
}
```

### Per-Branch Overrides
Override the policy for specific branches:

```json
{
  "num_drafts": 4,
  "branch_selection_policy": "best",
  "branch_policy_overrides": {
    "draft-0": "roulette",
    "draft-2": "diverse"
  }
}
```

## Domain Recommendations

| Domain | Recommended Policy | Rationale |
|--------|-------------------|-----------|
| Performance optimization | `best` | Clear metric (latency, memory) to optimize |
| Bug fixes | `best` | Metrics like error rate, test pass rate |
| API design | `diverse` | Multiple valid approaches to explore |
| Algorithm design | `diverse` or `roulette` | Trade-offs between complexity, readability, performance |
| Creative tasks | `roulette` | No clear metric to optimize |
| Initial exploration | `roulette` | Broad search before narrowing |
| Refinement | `best` | Exploit known good approaches |
| Architecture | `diverse` | Explore multiple architectural patterns |
| Research | `diverse` | Diverse exploration of solution space |

## Implementation

The policy framework is implemented in:
- `src/types.ts`: Type definitions and policy metadata
- `src/subagent-pool.ts`: Strategy logic and selection functions
- `src/run-manager.ts`: Integration with run configuration

## Metric Direction

Policies respect the metric direction configuration:
- `direction: "lower"` (e.g., latency, error rate): `best` selects lowest value
- `direction: "higher"` (e.g., accuracy, throughput): `best` selects highest value
