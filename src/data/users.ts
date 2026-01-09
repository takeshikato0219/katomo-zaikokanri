import type { User } from '../types';

// ユーザーアカウント一覧
// パスワードを変更する場合はこのファイルを編集してください
export const users: User[] = [
  { username: 'admin', password: 'admin123', displayName: '管理者' },
  { username: 'user01', password: 'pass01', displayName: 'ユーザー01' },
  { username: 'user02', password: 'pass02', displayName: 'ユーザー02' },
  { username: 'user03', password: 'pass03', displayName: 'ユーザー03' },
  { username: 'user04', password: 'pass04', displayName: 'ユーザー04' },
  { username: 'user05', password: 'pass05', displayName: 'ユーザー05' },
  { username: 'user06', password: 'pass06', displayName: 'ユーザー06' },
  { username: 'user07', password: 'pass07', displayName: 'ユーザー07' },
  { username: 'user08', password: 'pass08', displayName: 'ユーザー08' },
  { username: 'user09', password: 'pass09', displayName: 'ユーザー09' },
  { username: 'user10', password: 'pass10', displayName: 'ユーザー10' },
  { username: 'user11', password: 'pass11', displayName: 'ユーザー11' },
  { username: 'user12', password: 'pass12', displayName: 'ユーザー12' },
  { username: 'user13', password: 'pass13', displayName: 'ユーザー13' },
  { username: 'user14', password: 'pass14', displayName: 'ユーザー14' },
  { username: 'user15', password: 'pass15', displayName: 'ユーザー15' },
  { username: 'user16', password: 'pass16', displayName: 'ユーザー16' },
  { username: 'user17', password: 'pass17', displayName: 'ユーザー17' },
  { username: 'user18', password: 'pass18', displayName: 'ユーザー18' },
  { username: 'user19', password: 'pass19', displayName: 'ユーザー19' },
  { username: 'user20', password: 'pass20', displayName: 'ユーザー20' },
];

// ログイン認証
export const authenticate = (username: string, password: string): User | null => {
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  return user || null;
};
