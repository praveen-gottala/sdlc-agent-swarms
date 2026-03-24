import { NextResponse } from 'next/server';

/**
 * GET /api/diffs/[prNumber]
 * Returns a mock code diff for a pull request number.
 * TODO: Wire to GitHub MCP server for real PR diff retrieval.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ prNumber: string }> },
) {
  const { prNumber } = await params;

  const prNum = parseInt(prNumber, 10);

  if (isNaN(prNum) || prNum <= 0) {
    return NextResponse.json(
      { error: 'Invalid PR number' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    prNumber: prNum,
    title: `feat: implement user authentication module (#${prNum})`,
    author: 'code-gen',
    state: 'open',
    createdAt: '2026-03-22T06:00:00Z',
    filesChanged: 3,
    additions: 142,
    deletions: 8,
    files: [
      {
        filename: 'src/modules/auth/auth.service.ts',
        status: 'added',
        additions: 85,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,85 @@',
          '+import { Injectable } from \'@nestjs/common\';',
          '+import { JwtService } from \'@nestjs/jwt\';',
          '+',
          '+@Injectable()',
          '+export class AuthService {',
          '+  constructor(private readonly jwtService: JwtService) {}',
          '+',
          '+  async validateUser(email: string, password: string) {',
          '+    // TODO: implement user lookup',
          '+    return { id: \'user-1\', email };',
          '+  }',
          '+',
          '+  async generateToken(userId: string) {',
          '+    return this.jwtService.sign({ sub: userId });',
          '+  }',
          '+}',
        ].join('\n'),
      },
      {
        filename: 'src/modules/auth/auth.controller.ts',
        status: 'added',
        additions: 45,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,45 @@',
          '+import { Controller, Post, Body } from \'@nestjs/common\';',
          '+import { AuthService } from \'./auth.service\';',
          '+',
          '+@Controller(\'auth\')',
          '+export class AuthController {',
          '+  constructor(private readonly authService: AuthService) {}',
          '+',
          '+  @Post(\'login\')',
          '+  async login(@Body() body: { email: string; password: string }) {',
          '+    const user = await this.authService.validateUser(body.email, body.password);',
          '+    const token = await this.authService.generateToken(user.id);',
          '+    return { access_token: token };',
          '+  }',
          '+}',
        ].join('\n'),
      },
      {
        filename: 'src/app.module.ts',
        status: 'modified',
        additions: 12,
        deletions: 8,
        patch: [
          '@@ -1,8 +1,12 @@',
          ' import { Module } from \'@nestjs/common\';',
          '+import { AuthModule } from \'./modules/auth/auth.module\';',
          ' ',
          ' @Module({',
          '-  imports: [],',
          '+  imports: [AuthModule],',
          ' })',
          ' export class AppModule {}',
        ].join('\n'),
      },
    ],
  });
}
