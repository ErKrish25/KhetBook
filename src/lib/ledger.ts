import type { LedgerGroup } from '../types';

type VoucherLike = {
  ledger_group_id: string | null | undefined;
  amount: number;
};

const ROOT_KEY = '__root__';

const getParentKey = (parentId: string | null) => parentId ?? ROOT_KEY;

export function buildChildrenMap(groups: LedgerGroup[]) {
  const map = new Map<string, LedgerGroup[]>();

  for (const group of groups) {
    const key = getParentKey(group.parent_id);
    const siblings = map.get(key);
    if (siblings) {
      siblings.push(group);
    } else {
      map.set(key, [group]);
    }
  }

  return map;
}

export function getChildren(
  childrenMap: Map<string, LedgerGroup[]>,
  parentId: string | null
) {
  return childrenMap.get(getParentKey(parentId)) ?? [];
}

export function buildLedgerTotals(groups: LedgerGroup[], vouchers: VoucherLike[]) {
  const childrenMap = buildChildrenMap(groups);
  const directTotals = new Map<string, number>();

  for (const voucher of vouchers) {
    if (!voucher.ledger_group_id) {
      continue;
    }

    directTotals.set(
      voucher.ledger_group_id,
      (directTotals.get(voucher.ledger_group_id) ?? 0) + Number(voucher.amount ?? 0)
    );
  }

  const totals = new Map<string, number>();
  const descendants = new Map<string, string[]>();

  const visit = (groupId: string) => {
    if (totals.has(groupId)) {
      return {
        total: totals.get(groupId) ?? 0,
        descendantIds: descendants.get(groupId) ?? [groupId],
      };
    }

    const children = getChildren(childrenMap, groupId);
    let total = directTotals.get(groupId) ?? 0;
    const descendantIds = [groupId];

    for (const child of children) {
      const childResult = visit(child.id);
      total += childResult.total;
      descendantIds.push(...childResult.descendantIds);
    }

    totals.set(groupId, total);
    descendants.set(groupId, descendantIds);

    return { total, descendantIds };
  };

  for (const group of groups) {
    visit(group.id);
  }

  return {
    childrenMap,
    totalsByGroupId: totals,
    descendantIdsByGroupId: descendants,
  };
}
