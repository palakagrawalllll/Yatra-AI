# Travel Agent

Travel Agent is a web application that turns a trip request into a single travel plan. It gathers flight context, hotel research, and weather data before producing a day-by-day itinerary and a final recommendation.

The application is built around a LangGraph workflow and is exposed through a FastAPI web interface. Its current integration layer uses the Model Context Protocol (MCP) to connect the workflow to travel and search tools.

## What it does

- Accepts a natural-language travel request, including destination, duration, budget, and preferences.
- Produces flight guidance from AviationStack data.
- Researches hotel options with Tavily search.
- Retrieves current conditions and a short forecast from OpenWeather.
- Creates a practical itinerary using the collected results.
- Stores LangGraph workflow checkpoints in PostgreSQL.

## System design: MCP implementation

This is the architecture implemented in this repository. The LangGraph workflow runs the agents in sequence. Agents that need external information call the MCP client, which connects to the appropriate MCP server or endpoint. PostgreSQL is used by the LangGraph checkpointer to persist workflow state by thread ID.

```mermaid
flowchart TB
    User[User] --> UI[FastAPI web application]
    UI --> API[POST /api/travel]
    API --> Graph[LangGraph travel workflow]

    Graph --> Flight[Flight agent]
    Flight --> Hotel[Hotel agent]
    Hotel --> Weather[Weather agent]
    Weather --> Itinerary[Itinerary agent]
    Itinerary --> Final[Final response agent]
    Final --> UI

    Flight --> Client[MCP client]
    Hotel --> Client
    Weather --> Client

    Client --> Aviation[AviationStack MCP server\nstdio via uvx]
    Client --> Tavily[Tavily MCP endpoint\nstreamable HTTP]
    Client --> WeatherMCP[Custom weather MCP server\nlocal stdio]

    Aviation --> AviationAPI[AviationStack API]
    Tavily --> TavilyAPI[Tavily Search API]
    WeatherMCP --> OpenWeather[OpenWeather API]

    Graph <--> Database[(PostgreSQL\nLangGraph checkpoints)]
    Itinerary --> LLM[Groq LLM]
    Final --> LLM
    Flight --> LLM
    Weather --> LLM
```

### Agent responsibilities

| Agent | Responsibility | Integration |
| --- | --- | --- |
| Flight agent | Retrieves airport and airline context, then prepares route and fare guidance. | AviationStack MCP and Groq |
| Hotel agent | Searches for accommodation options relevant to the request. | Tavily MCP |
| Weather agent | Extracts the destination and obtains current weather and a forecast. | Custom weather MCP and Groq |
| Itinerary agent | Builds a day-by-day itinerary from the research collected by prior agents. | Groq |
| Final response agent | Combines the results into the response returned by the API. | Groq |

## System design: direct API alternative without MCP

MCP is useful when tool access needs a common interface across local and remote services. For a smaller deployment, the same workflow can call provider SDKs or HTTP APIs directly. In that design, each integration is implemented in the application instead of being discovered and invoked through an MCP client.

This diagram is a reference architecture; the current codebase uses the MCP design above.

```mermaid
flowchart TB
    User[User] --> UI[FastAPI web application]
    UI --> API[POST /api/travel]
    API --> Graph[LangGraph travel workflow]

    Graph --> Flight[Flight agent]
    Flight --> Hotel[Hotel agent]
    Hotel --> Weather[Weather agent]
    Weather --> Itinerary[Itinerary agent]
    Itinerary --> Final[Final response agent]
    Final --> UI

    Flight --> FlightService[Flight service adapter]
    Hotel --> HotelService[Hotel search adapter]
    Weather --> WeatherService[Weather service adapter]

    FlightService --> AviationAPI[AviationStack API]
    HotelService --> TavilyAPI[Tavily Search API]
    WeatherService --> OpenWeather[OpenWeather API]

    Graph <--> Database[(PostgreSQL\nLangGraph checkpoints)]
    Itinerary --> LLM[Groq LLM]
    Final --> LLM
    Flight --> LLM
    Weather --> LLM
```

## Request flow

1. The user submits a request from the web interface.
2. FastAPI calls `run_travel_agent` with the request and an optional thread ID.
3. LangGraph runs the flight, hotel, weather, itinerary, and final-response agents in order.
4. The research agents write their outputs into the shared `TravelState`.
5. The itinerary and final-response agents use that state to create the answer.
6. PostgreSQL persists a checkpoint for the graph run under the thread ID.

The checkpointer retains graph state and messages, but the current agents build their prompts from the new `user_query` and the results generated in the same run. A reused thread ID does not yet provide conversational follow-up planning.

## Project structure

```text
.
├── app.py                         FastAPI application and HTTP endpoints
├── backend.py                     LangGraph state, agents, and workflow
├── mcp_client.py                  MCP client configuration and helpers
├── custom_weather_mcp_server.py   Local MCP server for weather tools
├── requirements.txt               Python dependencies
├── static/                        Browser JavaScript and styles
├── templates/                     HTML templates
└── tools/                         Earlier direct tool experiments
```

## Requirements

- Python 3.10 or later
- PostgreSQL database
- Groq API key
- Tavily API key
- AviationStack API key
- OpenWeather API key
- `uvx` available on the command line for `aviationstack-mcp`

## Configuration

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/travel_db
GROQ_API_KEY=your_groq_api_key
AVIATIONSTACK_API_KEY=your_aviationstack_api_key
TAVILY_API_KEY=your_tavily_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
DEFAULT_ORIGIN_IATA=DAC
```

`backend.py` adds `sslmode=require` to `DATABASE_URL` when it is not already present. Use a database connection string that is appropriate for your PostgreSQL instance.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:8000/` in a browser.

## API

### Health check

```http
GET /health
```

### Create a travel plan

```http
POST /api/travel
Content-Type: application/json
```

```json
{
  "message": "Plan a 3-day trip to Tokyo with a budget of $1200",
  "thread_id": "optional-existing-thread-id"
}
```

The response includes the generated answer, the thread ID, intermediate flight and hotel results, the itinerary, and the number of recorded LLM calls.

## MCP services

The MCP client in `mcp_client.py` configures three integrations:

| Service | Transport | Tools used |
| --- | --- | --- |
| Tavily | Remote streamable HTTP | `tavily_search` |
| AviationStack | Local stdio process through `uvx aviationstack-mcp` | `list_airports`, `list_airlines` |
| Weather | Local stdio process running `custom_weather_mcp_server.py` | `get_current_weather`, `get_forecast` |

The weather server is part of this repository. Tavily and AviationStack are external services and require valid credentials.

## Notes

- AviationStack data is used for route and airline context. It does not guarantee live ticket pricing, so fare information in the response should be treated as planning guidance.
- API providers can return errors or incomplete data. The application currently handles failures in the flight agent and returns an unavailable message for that section.
- Do not commit the `.env` file or API credentials.
