/**
 * 综合项目 01 - 参考实现:类型定义
 */

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export interface TodoPatch {
  title?: string;
  completed?: boolean;
}
