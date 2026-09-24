"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { verifyOtpSchema } from "@/interface/form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function VerifyOtpForm() {
  const searchParams = useSearchParams();
  const email = decodeURIComponent(searchParams.get("email") || "");
  const router = useRouter();
  const form = useForm<z.infer<typeof verifyOtpSchema>>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: {
      otp: "",
      email: email || "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof verifyOtpSchema>) =>
      fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }),
  });

  const resendMutation = useMutation({
    mutationFn: (email: string) =>
      fetch("/api/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
  });

  const handleResendOtp = async () => {
    if (!email) {
      toast.error("Email is required to resend OTP");
      return;
    }
    try {
      const res = await resendMutation.mutateAsync(email);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to resend OTP");
      }
      toast.success("New OTP code sent to your email!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error resending OTP"
      );
    }
  };

  async function onSubmit(values: z.infer<typeof verifyOtpSchema>) {
    try {
      const res = await mutation.mutateAsync(values);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "OTP verification failed");
      }

      toast.success("OTP verified successfully!");
      router.refresh();
      window.location.replace("/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid OTP code");
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50/50">
      <div className="w-full max-w-md space-y-8 rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Verify OTP</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter the 6-digit code sent to your email
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OTP Code</FormLabel>
                  <FormControl>
                    <Input placeholder="000000" {...field} />
                  </FormControl>
                  <FormDescription>
                    Checking your email for the secret code.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Verifying..." : "Verify OTP"}
            </Button>
          </form>
        </Form>
        <div className="text-center text-sm">
          Didn&apos;t receive a code?{" "}
          <button
            type="button"
            onClick={handleResendOtp}
            disabled={resendMutation.isPending}
            className="text-primary underline underline-offset-4 cursor-pointer disabled:opacity-50"
          >
            {resendMutation.isPending ? "Resending..." : "Resend"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtp() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyOtpForm />
    </Suspense>
  );
}
