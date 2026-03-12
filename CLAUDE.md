# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **n8n workflow automation suite** for financial market analysis and reporting. It consists of 6 JSON workflow definition files that are imported into an n8n instance — there is no traditional build system, package manager, or application code.

## Working with Workflows

These `.json` files are n8n workflow definitions. To develop or deploy:

- **Import a workflow:** In n8n UI → Workflows → Import from file → select the JSON file
- **Export a workflow:** In n8n UI → open workflow → ⋮ menu → Download
- **Edit workflows:** Either via the n8n UI (recommended for node wiring) or directly editing JSON
- **Activate/deactivate:** Workflows with schedule triggers must be toggled active in n8n

There are no lint, build, or test commands — changes are validated by importing and running them in n8n.

## Architecture

Six workflows run on a daily/weekly schedule throughout the US trading day, pulling from financial APIs, storing data in Google Sheets, and publishing summaries to Discord.

### Workflow Schedule & Purpose

| Workflow | Schedule | Role |
|---|---|---|
| `Economic Calendar.json` | 6 AM daily, 7 AM Sunday | Fetches USD economic events from Forex Factory; stores to Sheets + Discord |
| `Pre-Market Brief.json` | Pre-market (~8–9 AM ET) | Fetches pre-market data; identifies RISK-ON/OFF/MIXED sentiment; sector strength ranking |
| `News Feed.json` | 8:15 AM and 4:30 PM ET | Fetches Finnhub news (general/forex/crypto/M&A); scores by institutional signal importance; LLM summary via Groq (Llama 3.3-70b) |
| `EOD Recap.json` | 4:30 PM ET | Fetches 5-day price data for 31+ tickers from Yahoo Finance; calculates breadth, volume, sector rotation |
| `Housekeeping.json` | Monday 8 AM | Reads weekly data from Sheets for aggregation cleanup |
| `Weekly Recap.json` | Friday 5 PM ET | Aggregates full week of Pre-Market + EOD + Economic Calendar data; posts summary to Discord |

### External Integrations

- **Yahoo Finance** — EOD price data (public endpoint, no API key)
- **Finnhub API** — News feed (API key embedded in `News Feed.json`)
- **Forex Factory API** — Economic calendar data
- **Google Sheets** — Persistent storage via n8n OAuth2 credentials
  - `DailySnapshots` spreadsheet (`1jQH5MB_DElm367Mf7KWLKYT9oTbV4G6WbtT9lUZJrYs`): PreMarket and EOD sheets
  - `Economic Calendar` spreadsheet (`1KVDQ-YkOU8SMeE8-wgFnUq4wE8soFeXrSFnRhmmmJxQ`)
- **Discord webhooks** — All workflows publish formatted output to Discord channels
- **Groq (LangChain node)** — LLM inference for news summarization in News Feed workflow

### Data Flow

```
Yahoo Finance  →  EOD Recap        →  Google Sheets (EOD sheet)
                                   →  Discord
Finnhub        →  News Feed        →  Discord
Forex Factory  →  Economic Cal     →  Google Sheets (Econ Cal)
                                   →  Discord
All Sheets     →  Housekeeping     →  Aggregated data
               →  Weekly Recap     →  Discord
```

### n8n Node Types Used

- `scheduleTrigger` — Cron-based scheduling
- `httpRequest` — All external API calls
- `code` (JavaScript) — Data parsing, filtering, scoring, and formatting logic
- `googleSheets` — Read/write to spreadsheets
- `aggregate` — Combining data from multiple branches
- LangChain nodes (`@n8n/n8n-nodes-langchain`) — LLM summarization

## Key Implementation Details

- All schedule times are in **US Eastern Time** (ET), with auto-detection for EDT/EST in the Economic Calendar workflow
- Volume analysis in EOD Recap flags tickers with >1.5x average volume as unusual
- EOD Recap tracks 31+ tickers covering: futures, indexes, sectors (XLK, XLF, XLE, etc.), crypto (BTC, ETH), commodities (GLD, SLV, OIL), and rates (TLT, HYG)
- News scoring in News Feed uses keyword-based institutional signal scoring (Fed, FOMC, earnings, tariffs, etc.) before LLM summarization
- Credentials (Google Sheets OAuth2, Discord webhooks, Finnhub API key, Groq key) are stored in n8n's credential store and referenced by ID in the JSON — these IDs will differ per n8n instance and must be reconfigured after import
