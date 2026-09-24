"use client";

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
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginSchema } from "@/interface/form";

export default function Login() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof loginSchema>) =>
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      }),
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    try {
      const res = await mutation.mutateAsync(values);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Login failed");
      }
      console.log("Login successful", data);

      setIsRedirecting(true);
      toast.success("Login successful!");
      router.refresh();
      window.location.replace("/dashboard");
    } catch (error) {
      setIsRedirecting(false);
      toast.error(
        error instanceof Error ? error.message : "Invalid email or password",
      );
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50/50">
      <div className="w-full max-w-md space-y-8 rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Enter your credentials to access your account
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="m@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full cursor-pointer"
              disabled={mutation.isPending || isRedirecting}
            >
              {mutation.isPending || isRedirecting ? "Logging in..." : "Login"}
            </Button>
          </form>
        </Form>
        <div className="text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/sign-up"
            className="text-primary underline underline-offset-4"
          >
            Sign up
          </Link>
        </div>
        <div className="text-center text-sm">
          <Link
            href="/auth/forgot-pwd"
            className="text-primary underline underline-offset-4"
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
}
