/**
 * 综合项目 01 - 类型定义(已给,无需修改)
 */

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

/** PATCH 允许更新的字段 */
export interface TodoPatch {
  title?: string;
  completed?: boolean;
}
