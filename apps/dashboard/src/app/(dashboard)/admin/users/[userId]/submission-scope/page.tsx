import { UserSubmissionScope } from "@/features/manage-users/ui/user-submission-scope";
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserSubmissionScope key={userId} userId={userId}/>;
}
