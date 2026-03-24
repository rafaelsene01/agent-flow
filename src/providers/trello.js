const BASE_URL = "https://api.trello.com/1";

function auth(config) {
  return `key=${config.api_key}&token=${config.api_token}`;
}

async function request(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Trello API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getBoards(config) {
  return request(`${BASE_URL}/members/me/boards?${auth(config)}&filter=open&fields=id,name`);
}

export async function getLists(config, boardId) {
  return request(`${BASE_URL}/boards/${boardId}/lists?${auth(config)}&filter=open&fields=id,name`);
}

export async function getCards(config, boardId) {
  return request(
    `${BASE_URL}/boards/${boardId}/cards?${auth(config)}&filter=open&fields=id,name,idList,labels,due,shortUrl&members=true&member_fields=fullName`
  );
}

export async function getMembers(config, boardId) {
  return request(`${BASE_URL}/boards/${boardId}/members?${auth(config)}&fields=id,fullName,username`);
}

export async function validateCredentials(config) {
  try {
    await request(`${BASE_URL}/members/me?${auth(config)}&fields=fullName,username`);
    return true;
  } catch {
    return false;
  }
}

export async function getMemberInfo(config) {
  return request(`${BASE_URL}/members/me?${auth(config)}&fields=fullName,username`);
}

export async function getBoardByName(config, name) {
  const boards = await getBoards(config);
  const board = boards.find(
    (b) => b.name.toLowerCase() === name.toLowerCase()
  );
  return board || null;
}
