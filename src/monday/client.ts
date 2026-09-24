// Read-only monday.com GraphQL client. Per CLAUDE.md, this codebase must
// never write to monday.com — this module intentionally exposes only a
// generic query function, never a mutation helper.

const MONDAY_API_URL = "https://api.monday.com/v2";

type GraphQlError = { message: string };

type GraphQlResponse<T> = {
  data?: T;
  errors?: GraphQlError[];
};

export async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error("MONDAY_API_TOKEN is not set in the environment.");
  }

  if (/\b(mutation)\b/i.test(query)) {
    throw new Error("Refusing to send a mutation to monday.com — this client is read-only.");
  }

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`monday.com API request failed: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as GraphQlResponse<T>;
  if (json.errors?.length) {
    throw new Error(`monday.com API error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("monday.com API returned no data.");
  }

  return json.data;
}

export type MondayColumnValue = {
  id: string;
  text: string | null;
  value: string | null;
  // Only populated for board_relation columns — text/value are null for
  // this column type in this API version, so linked items must be read
  // from these fields instead.
  linked_item_ids?: string[];
  linked_items?: { id: string; name: string }[];
};

export type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

export type MondayBoardItemsPage = {
  boards: {
    items_page: {
      cursor: string | null;
      items: MondayItem[];
    };
  }[];
};

const COLUMN_VALUE_FIELDS = `
  id
  text
  value
  ... on BoardRelationValue {
    linked_item_ids
    linked_items {
      id
      name
    }
  }
`;

const ITEMS_PAGE_QUERY = `
  query BoardItems($boardId: ID!, $cursor: String, $columnIds: [String!]) {
    boards(ids: [$boardId]) {
      items_page(limit: 100, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            ${COLUMN_VALUE_FIELDS}
          }
        }
      }
    }
  }
`;

const NEXT_ITEMS_PAGE_QUERY = `
  query NextItems($cursor: String!, $columnIds: [String!]) {
    next_items_page(limit: 100, cursor: $cursor) {
      cursor
      items {
        id
        name
        column_values(ids: $columnIds) {
          ${COLUMN_VALUE_FIELDS}
        }
      }
    }
  }
`;

/** Fetches every item on a board, paginating through items_page/next_items_page. */
export async function fetchAllBoardItems(boardId: string, columnIds?: string[]): Promise<MondayItem[]> {
  const items: MondayItem[] = [];

  const first = await mondayQuery<MondayBoardItemsPage>(ITEMS_PAGE_QUERY, { boardId, columnIds });
  const board = first.boards[0];
  if (!board) {
    throw new Error(`monday.com board ${boardId} not found or not accessible with this token.`);
  }

  items.push(...board.items_page.items);
  let cursor = board.items_page.cursor;

  while (cursor) {
    const page = await mondayQuery<{ next_items_page: { cursor: string | null; items: MondayItem[] } }>(
      NEXT_ITEMS_PAGE_QUERY,
      { cursor, columnIds },
    );
    items.push(...page.next_items_page.items);
    cursor = page.next_items_page.cursor;
  }

  return items;
}

export function getColumnValue(item: MondayItem, columnId: string): MondayColumnValue | undefined {
  return item.column_values.find((cv) => cv.id === columnId);
}

export function getColumnText(item: MondayItem, columnId: string): string | null {
  return getColumnValue(item, columnId)?.text ?? null;
}

/** For a board_relation column: the ids of the linked items (text/value are null for this column type). */
export function getLinkedItemIds(item: MondayItem, columnId: string): string[] {
  return getColumnValue(item, columnId)?.linked_item_ids ?? [];
}

/** For a board_relation column: the display name of the first linked item, if any. */
export function getLinkedItemName(item: MondayItem, columnId: string): string | null {
  return getColumnValue(item, columnId)?.linked_items?.[0]?.name ?? null;
}
