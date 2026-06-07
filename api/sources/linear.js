const BASE_URL = "https://api.linear.app/graphql";

async function query(apiKey, gql, variables = {}) {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query: gql, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
}

export async function validateCredentials(config) {
  try {
    await query(config.api_key, `{ viewer { id } }`);
    return true;
  } catch {
    return false;
  }
}

export async function getMemberInfo(config) {
  const data = await query(config.api_key, `{
    viewer { id name email }
  }`);
  return data.viewer;
}

export async function getTeams(config) {
  const data = await query(config.api_key, `{
    teams { nodes { id name key } }
  }`);
  return data.teams.nodes;
}

export async function getWorkflowStates(config, teamId) {
  const data = await query(
    config.api_key,
    `query($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type position }
      }
    }`,
    { teamId }
  );
  return data.workflowStates.nodes.sort((a, b) => a.position - b.position);
}

export async function getLabels(config, teamId) {
  const data = await query(
    config.api_key,
    `query($teamId: ID!) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name color }
      }
    }`,
    { teamId }
  );
  return data.issueLabels.nodes;
}

export async function getIssues(config, teamId) {

  const filter = { team: { id: { eq: teamId } } };

  if (config.pick_from && config.pick_from.length > 0) {
    filter.state = { name: { in: config.pick_from } };
  }

  if (config.label) {
    filter.labels = { name: { eq: config.label } };
  }

  const data = await query(
    config.api_key,
    `query($filter: IssueFilter) {
      issues(filter: $filter, first: 250) {
        nodes {
          id
          title
          identifier
          priority
          url
          dueDate
          completedAt
          description
          state { id name type }
          assignee { id name displayName }
          labels { nodes { id name color } }
        }
      }
    }`,
    { filter }
  );

  return data.issues.nodes;
}

export async function getTeamByName(config, name) {
  const teams = await getTeams(config);
  return teams.find((t) => t.name.toLowerCase() === name.toLowerCase()) || null;
}

export async function updateIssueState(config, issueId, stateId) {
  const data = await query(
    config.api_key,
    `mutation($issueId: String!, $stateId: String!) {
      issueUpdate(id: $issueId, input: { stateId: $stateId }) {
        success
        issue { id state { id name type } }
      }
    }`,
    { issueId, stateId }
  );
  if (!data.issueUpdate.success) throw new Error("Falha ao atualizar o estado da issue.");
  return data.issueUpdate.issue;
}
