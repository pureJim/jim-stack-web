// eslint-disable-next-line import/no-anonymous-default-export
export default function (payload: unknown) {
  const file = payload as File & { originFileObj: File };
  return new Blob([file.originFileObj], { type: file.type });
}
