# Model Routing

## Overview

Auto Research supports flexible model routing to optimize for cost, performance, and quality based on task complexity. The system uses a tiered approach with free models prioritized for simple tasks and paid models available for complex reasoning.

## Configuration

Model routing is configured in `config/model-routing.json` with the following structure:

```json
{
  "version": "1.0.0",
  "description": "Autoresearch model routing — free models first, paid for complex",
  "routing": {
    "task_type": {
      "tier_order": ["free", "paid", "fallback"],
      "tiers": {
        "free": ["model1", "model2"],
        "paid": ["model3", "model4"],
        "fallback": ["model5"]
      },
      "selection": "round-robin"
    }
  },
  "max_concurrent": 10
}
```

## Local Endpoints

Auto Research supports OpenAI-compatible local endpoints for running models locally:

### Supported Local Providers

1. **LM Studio** - `http://localhost:1234/v1`
2. **Ollama** - `http://localhost:11434/v1`
3. **Text Generation WebUI** - `http://localhost:5000/v1`
4. **vLLM** - `http://localhost:8000/v1`
5. **LocalAI** - `http://localhost:8080/v1`

### Rate Limits & Constraints

Local endpoints typically have these constraints:

| Provider | Max Concurrent | Token Limits | Notes |
|----------|----------------|--------------|-------|
| LM Studio | 4-8 | Model-dependent | GPU memory limited |
| Ollama | 2-4 | Model-dependent | CPU/GPU hybrid |
| TGWUI | 1-2 | Model-dependent | Single model loaded |
| vLLM | 8-16 | High throughput | Optimized for serving |
| LocalAI | 4-8 | Variable | Multiple backends |

## Role-Based Presets

Auto Research provides presets optimized for different agent roles:

### Verifier Role
Optimized for fast, reliable verification tasks:

```json
{
  "verifier": {
    "tier_order": ["free", "paid", "fallback"],
    "tiers": {
      "free": [
        "opencode-zen/nemotron-3-super-free",
        "opencode-zen/ling-2.6-flash-free"
      ],
      "paid": [
        "opencode-go/deepseek-v4-flash"
      ],
      "fallback": [
        "kimi-k2.6"
      ]
    },
    "selection": "round-robin"
  }
}
```

### Implementer Role
Optimized for complex implementation and reasoning tasks:

```json
{
  "implementer": {
    "tier_order": ["free", "paid", "fallback"],
    "tiers": {
      "free": [
        "opencode-zen/big-pickle",
        "opencode-zen/minimax-m2.5-free"
      ],
      "paid": [
        "opencode-go/deepseek-v4-pro"
      ],
      "fallback": [
        "kimi-k2.6",
        "gpt-5.5"
      ]
    },
    "selection": "round-robin"
  }
}
```

### Research Role
Balanced for exploratory tasks:

```json
{
  "research": {
    "tier_order": ["free", "paid", "fallback"],
    "tiers": {
      "free": [
        "opencode-zen/big-pickle",
        "opencode-zen/minimax-m2.5-free",
        "opencode-zen/hy3-preview-free",
        "opencode-zen/ling-2.6-flash-free",
        "opencode-zen/nemotron-3-super-free",
        "opencode-zen/gpt-5-nano-free"
      ],
      "paid": [
        "opencode-go/deepseek-v4-pro",
        "opencode-go/deepseek-v4-flash"
      ],
      "fallback": [
        "kimi-k2.6",
        "gpt-5.5"
      ]
    },
    "selection": "round-robin"
  }
}
```

## Quality vs Performance Tradeoffs

### Free Models
- **Quality**: Good for straightforward tasks
- **Speed**: Fastest for simple operations
- **Cost**: $0
- **Best for**: Verification, simple fixes, documentation

### Paid Models
- **Quality**: Higher reasoning capability
- **Speed**: Slower but more consistent
- **Cost**: Usage-based pricing
- **Best for**: Complex implementations, architecture decisions, debugging

### Fallback Models
- **Quality**: Variable reliability
- **Speed**: Depends on service availability
- **Cost**: May incur charges
- **Best for**: Last resort when primary options fail

## Usage Guidelines

### Task Complexity Mapping

| Complexity | Recommended Tier | Example Tasks |
|------------|------------------|---------------|
| Simple | Free | Lint fixes, typos, trivial refactors |
| Moderate | Free → Paid | Feature additions, medium refactors |
| Complex | Paid → Fallback | Architecture changes, complex algorithms |
| Critical | Paid + Fallback | Security fixes, breaking changes |

### Environment Variables

Override routing behavior with:

- `AUTORESEARCH_MODEL_TIER` - Force specific tier (free/paid/fallback)
- `AUTORESEARCH_MODEL_SELECTION` - Change selection strategy (round-robin/random)
- `AUTORESEARCH_MAX_CONCURRENT` - Override max concurrent requests

### Local Development

For local development with no external API costs:

1. Configure local endpoint in environment:
   ```bash
   export OPENAI_BASE_URL="http://localhost:1234/v1"
   export OPENAI_API_KEY="not-needed-for-local"
   ```

2. Use free tier models that are available locally:
   ```json
   {
     "free": ["local-llama3", "local-mistral"]
   }
   ```

## Monitoring & Adjustments

### Checking Current Routing

View active model usage:
```bash
autoresearch config --show-routing
```

### Adjusting for Performance

If experiencing slowdowns:
1. Reduce `max_concurrent` in config
2. Prefer faster free models over paid ones
3. Use local endpoints to eliminate network latency

### Quality Issues

If seeing quality degradation:
1. Increase complexity threshold for paid model usage
2. Add more capable models to paid tier
3. Consider paid API fallback for critical tasks